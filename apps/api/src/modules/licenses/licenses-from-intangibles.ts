import {
  LicenseStatus,
  LicenseType,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

/**
 * Agrupa los intangibles vigentes en licencias de `software_licenses` (origin = 'intangibles').
 *
 * Es una función suelta (no un servicio de Nest) para que la usen tanto la API (al subir o cambiar
 * la versión del Excel) como el script `import:siga-intangibles`. Es idempotente: cada grupo se
 * identifica por su descripción normalizada (`origin_key`), y nunca toca licencias de otro origen.
 */

export const LICENSE_ORIGIN_INTANGIBLES = 'intangibles';
/** Una licencia pasa a "por vencer" si su próxima renovación cae dentro de esta ventana. */
export const LICENSE_EXPIRING_DAYS = 90;

/** "Licencia  de Microsoft Próject " → "LICENCIA DE MICROSOFT PROJECT". */
export function licenseGroupKey(
  description: string | null | undefined,
): string | null {
  const key = (description ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return key ? key.slice(0, 300) : null;
}

type Member = {
  description: string;
  brand: string | null;
  active: boolean;
  condition: string | null;
  expiresAt: string | null; // YYYY-MM-DD
  value: number | null;
};

export type RegenerateResult = {
  groups: number;
  created: number;
  updated: number;
  retired: number;
};

function mode(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function localToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lee las versiones vigentes y arma los miembros (bienes) de cada grupo, por clave. */
export async function loadIntangibleGroups(
  prisma: Pick<PrismaClient, 'intangibleBatch' | 'intangibleRecord'>,
  tenantId: string,
): Promise<
  Map<
    string,
    Array<
      Member & { code: string; poNumber: number | null; poYear: number | null }
    >
  >
> {
  const batches = await prisma.intangibleBatch.findMany({
    where: { tenantId, isCurrent: true },
    select: { id: true, source: true },
  });
  const sigaId = batches.find((b) => b.source === 'siga')?.id;
  const coordId = batches.find((b) => b.source === 'coordinator')?.id;
  const select = {
    patrimonialCode: true,
    description: true,
    brand: true,
    status: true,
    conditionNorm: true,
    expiresAt: true,
    initialValue: true,
    poNumber: true,
    poYear: true,
  } as const;
  const siga = sigaId
    ? await prisma.intangibleRecord.findMany({
        where: { batchId: sigaId },
        select,
      })
    : [];
  const coord = coordId
    ? await prisma.intangibleRecord.findMany({
        where: { batchId: coordId },
        select,
      })
    : [];
  const coordByCode = new Map(coord.map((c) => [c.patrimonialCode, c]));
  const sigaCodes = new Set(siga.map((s) => s.patrimonialCode));

  const groups = new Map<
    string,
    Array<
      Member & { code: string; poNumber: number | null; poYear: number | null }
    >
  >();
  const add = (
    key: string | null,
    m: Member & {
      code: string;
      poNumber: number | null;
      poYear: number | null;
    },
  ) => {
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  };

  // SIGA manda en los datos base; el Excel aporta condición y vencimiento.
  for (const s of siga) {
    const c = coordByCode.get(s.patrimonialCode);
    add(licenseGroupKey(s.description), {
      code: s.patrimonialCode,
      description: s.description ?? '',
      brand: s.brand,
      active: s.status !== 'retired',
      condition: c?.conditionNorm ?? null,
      expiresAt: isoDate(c?.expiresAt ?? null),
      value: s.initialValue === null ? null : Number(s.initialValue),
      poNumber: s.poNumber,
      poYear: s.poYear,
    });
  }
  // Bienes que solo están en el Excel (p. ej. si el Excel es más nuevo que el corte de SIGA).
  for (const c of coord) {
    if (sigaCodes.has(c.patrimonialCode)) continue;
    add(licenseGroupKey(c.description), {
      code: c.patrimonialCode,
      description: c.description ?? '',
      brand: c.brand,
      active: true,
      condition: c.conditionNorm,
      expiresAt: isoDate(c.expiresAt),
      value: c.initialValue === null ? null : Number(c.initialValue),
      poNumber: c.poNumber,
      poYear: c.poYear,
    });
  }
  return groups;
}

export async function regenerateLicensesFromIntangibles(
  prisma: PrismaClient,
  tenantId: string,
  now = new Date(),
): Promise<RegenerateResult> {
  const groups = await loadIntangibleGroups(prisma, tenantId);
  const today = localToday(now);
  const expiringLimit = addDays(today, LICENSE_EXPIRING_DAYS);

  const desired = [...groups.entries()].map(([key, members]) => {
    const active = members.filter((m) => m.active);
    const future = active
      .map((m) => m.expiresAt)
      .filter((d): d is string => !!d && d >= today)
      .sort();
    const past = active
      .map((m) => m.expiresAt)
      .filter((d): d is string => !!d && d < today)
      .sort();

    let status: LicenseStatus = LicenseStatus.active;
    let renewal: string | null = null;
    if (!active.length) {
      status = LicenseStatus.retired;
    } else if (future.length) {
      renewal = future[0];
      status =
        renewal <= expiringLimit
          ? LicenseStatus.expiring
          : LicenseStatus.active;
    } else if (past.length) {
      renewal = past[past.length - 1];
      status = LicenseStatus.expired;
    }

    const indefinida = active.filter(
      (m) => m.condition === 'VIDA ÚTIL INDEFINIDA',
    ).length;
    const definida = active.filter(
      (m) => m.condition === 'VIDA ÚTIL DEFINIDA',
    ).length;
    const values = active
      .map((m) => m.value)
      .filter((v): v is number => v !== null);

    return {
      originKey: key,
      softwareName: (mode(members.map((m) => m.description)) ?? key).slice(
        0,
        140,
      ),
      // "SIN MARCA" es un marcador de SIGA, no un fabricante.
      vendor:
        mode(
          members.map((m) =>
            m.brand && licenseGroupKey(m.brand) !== 'SIN MARCA'
              ? m.brand
              : null,
          ),
        )?.slice(0, 120) ?? null,
      licenseType:
        indefinida > definida
          ? LicenseType.perpetual
          : LicenseType.subscription,
      totalSeats: active.length,
      unitCost: new Prisma.Decimal(
        values.length
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
          : 0,
      ),
      renewalDate: renewal ? new Date(`${renewal}T00:00:00Z`) : null,
      status,
    };
  });

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.softwareLicense.findMany({
        where: { tenantId, origin: LICENSE_ORIGIN_INTANGIBLES },
      });
      const byKey = new Map(existing.map((l) => [l.originKey, l]));
      const result: RegenerateResult = {
        groups: desired.length,
        created: 0,
        updated: 0,
        retired: 0,
      };

      const toCreate = desired.filter((d) => !byKey.has(d.originKey));
      if (toCreate.length) {
        await tx.softwareLicense.createMany({
          data: toCreate.map((d) => ({
            ...d,
            tenantId,
            origin: LICENSE_ORIGIN_INTANGIBLES,
          })),
        });
        result.created = toCreate.length;
      }

      for (const d of desired) {
        const cur = byKey.get(d.originKey);
        if (!cur) continue;
        const changed =
          cur.softwareName !== d.softwareName ||
          cur.vendor !== d.vendor ||
          cur.licenseType !== d.licenseType ||
          cur.totalSeats !== d.totalSeats ||
          !cur.unitCost.equals(d.unitCost) ||
          isoDate(cur.renewalDate) !== isoDate(d.renewalDate) ||
          cur.status !== d.status;
        if (!changed) continue;
        await tx.softwareLicense.update({ where: { id: cur.id }, data: d });
        result.updated++;
      }

      // Grupos que ya no existen en las versiones vigentes: se retiran, no se borran.
      const desiredKeys = new Set(desired.map((d) => d.originKey));
      const gone = existing.filter(
        (l) =>
          l.originKey &&
          !desiredKeys.has(l.originKey) &&
          l.status !== LicenseStatus.retired,
      );
      if (gone.length) {
        await tx.softwareLicense.updateMany({
          where: { id: { in: gone.map((l) => l.id) } },
          data: { status: LicenseStatus.retired, totalSeats: 0 },
        });
        result.retired = gone.length;
      }
      return result;
    },
    { timeout: 120_000 },
  );
}
