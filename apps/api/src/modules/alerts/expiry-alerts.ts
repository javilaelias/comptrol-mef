import { AlertStatus, LicenseStatus, type PrismaClient } from '@prisma/client';

/**
 * Genera las alertas de vencimiento de licencias (solo en la app, sin correo).
 *
 * Función suelta, como la regeneración de licencias: la usan la tarea diaria, la API (después de
 * recalcular licencias) y el script de SIGA. Es idempotente: el índice único
 * (tenant, tipo, licencia, umbral, fecha) evita duplicados aunque corra varias veces.
 */

export const ALERT_KIND_LICENSE_EXPIRY = 'license_expiry';
export const DEFAULT_DAYS_BEFORE = [90, 60, 30, 7];
/** Umbral que se guarda para las licencias ya vencidas. */
export const EXPIRED_THRESHOLD = -1;

export type GenerateAlertsResult = {
  enabled: boolean;
  created: number;
  reopened: number;
  autoResolved: number;
};

function localToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Umbral que corresponde a una licencia que vence en `daysLeft` días: el más cercano de los que ya
 * cruzó (a 20 días con umbrales 90/60/30/7 → 30). Vencida → -1 (si se incluyen). Ninguno → null.
 */
export function pickThreshold(
  daysLeft: number,
  daysBefore: number[],
  includeExpired: boolean,
): number | null {
  if (daysLeft < 0) return includeExpired ? EXPIRED_THRESHOLD : null;
  const crossed = daysBefore.filter((t) => daysLeft <= t);
  return crossed.length ? Math.min(...crossed) : null;
}

export async function generateExpiryAlerts(
  prisma: PrismaClient,
  tenantId: string,
  now = new Date(),
): Promise<GenerateAlertsResult> {
  const rule = await prisma.alertRule.findUnique({ where: { tenantId } });
  const enabled = rule?.enabled ?? true;
  if (!enabled) return { enabled, created: 0, reopened: 0, autoResolved: 0 };
  const daysBefore = rule?.daysBefore?.length
    ? rule.daysBefore
    : DEFAULT_DAYS_BEFORE;
  const includeExpired = rule?.includeExpired ?? true;

  const today = localToday(now);
  const licenses = await prisma.softwareLicense.findMany({
    where: {
      tenantId,
      renewalDate: { not: null },
      status: { notIn: [LicenseStatus.retired, LicenseStatus.suspended] },
    },
    select: { id: true, softwareName: true, renewalDate: true },
  });

  const desired = licenses.flatMap((l) => {
    const due = l.renewalDate!.toISOString().slice(0, 10);
    const threshold = pickThreshold(
      daysBetween(today, due),
      daysBefore,
      includeExpired,
    );
    if (threshold === null) return [];
    return [
      {
        tenantId,
        kind: ALERT_KIND_LICENSE_EXPIRY,
        targetType: 'software_license',
        targetId: l.id,
        title: l.softwareName.slice(0, 300),
        thresholdDays: threshold,
        dueDate: new Date(`${due}T00:00:00Z`),
      },
    ];
  });
  const key = (a: { targetId: string; thresholdDays: number; dueDate: Date }) =>
    `${a.targetId}|${a.thresholdDays}|${a.dueDate.toISOString().slice(0, 10)}`;
  const desiredKeys = new Set(desired.map(key));
  const desiredTargets = new Set(desired.map((d) => d.targetId));

  return prisma.$transaction(async (tx) => {
    const { count: created } = desired.length
      ? await tx.alert.createMany({ data: desired, skipDuplicates: true })
      : { count: 0 };

    // Una alerta que se cerró sola y vuelve a corresponder (p. ej. se reactivó "alertar vencidas")
    // se reabre: el índice único impediría crearla de nuevo. Las atendidas/descartadas por una
    // persona se respetan.
    const closedByTheSystem = desiredTargets.size
      ? await tx.alert.findMany({
          where: {
            tenantId,
            kind: ALERT_KIND_LICENSE_EXPIRY,
            status: AlertStatus.auto_resolved,
            targetId: { in: [...desiredTargets] },
          },
          select: {
            id: true,
            targetId: true,
            thresholdDays: true,
            dueDate: true,
          },
        })
      : [];
    const reopen = closedByTheSystem
      .filter((a) => desiredKeys.has(key(a)))
      .map((a) => a.id);
    if (reopen.length) {
      await tx.alert.updateMany({
        where: { id: { in: reopen } },
        data: { status: AlertStatus.open, resolvedAt: null, resolution: null },
      });
    }

    // Las alertas abiertas que ya no corresponden se cierran solas: o las reemplaza una alerta de
    // un umbral más cercano, o cambió el vencimiento / la licencia ya no aplica.
    const open = await tx.alert.findMany({
      where: {
        tenantId,
        kind: ALERT_KIND_LICENSE_EXPIRY,
        status: AlertStatus.open,
      },
      select: { id: true, targetId: true, thresholdDays: true, dueDate: true },
    });
    const stale = open.filter((a) => !desiredKeys.has(key(a)));
    const superseded = stale
      .filter((a) => desiredTargets.has(a.targetId))
      .map((a) => a.id);
    const gone = stale
      .filter((a) => !desiredTargets.has(a.targetId))
      .map((a) => a.id);
    const resolvedAt = new Date();
    if (superseded.length) {
      await tx.alert.updateMany({
        where: { id: { in: superseded } },
        data: {
          status: AlertStatus.auto_resolved,
          resolvedAt,
          resolution: 'Reemplazada por una alerta más reciente',
        },
      });
    }
    if (gone.length) {
      await tx.alert.updateMany({
        where: { id: { in: gone } },
        data: {
          status: AlertStatus.auto_resolved,
          resolvedAt,
          resolution:
            'Resuelta por actualización: cambió el vencimiento o la licencia ya no aplica',
        },
      });
    }
    return {
      enabled,
      created,
      reopened: reopen.length,
      autoResolved: stale.length,
    };
  });
}
