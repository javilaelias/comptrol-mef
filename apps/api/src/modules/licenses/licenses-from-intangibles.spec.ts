import { Prisma, type PrismaClient } from '@prisma/client';
import {
  licenseGroupKey,
  regenerateLicensesFromIntangibles,
} from './licenses-from-intangibles';

type Rec = {
  batchId: string;
  patrimonialCode: string;
  description: string;
  brand: string | null;
  status: 'active' | 'retired' | null;
  conditionNorm: string | null;
  expiresAt: Date | null;
  initialValue: Prisma.Decimal | null;
  poNumber: number | null;
  poYear: number | null;
};
type Lic = Record<string, unknown> & {
  id: string;
  tenantId: string;
  origin: string;
  originKey: string | null;
};

/** Base en memoria con lo mínimo que usa la regeneración. */
function fakePrisma(records: Rec[], licenses: Lic[]) {
  let seq = 0;
  const batches = [
    { id: 'siga', source: 'siga', tenantId: 't' },
    { id: 'coord', source: 'coordinator', tenantId: 't' },
  ];
  const match = (l: Lic, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      k === 'id' && v && typeof v === 'object' && 'in' in v
        ? (v as { in: string[] }).in.includes(l.id)
        : l[k] === v,
    );
  const softwareLicense = {
    findMany: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        licenses.filter((l) => match(l, where)).map((l) => ({ ...l })),
      ),
    createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
      data.forEach((d) => licenses.push({ ...(d as Lic), id: `new-${++seq}` }));
      return Promise.resolve({ count: data.length });
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      Object.assign(licenses.find((l) => l.id === where.id)!, data);
      return Promise.resolve({});
    },
    updateMany: ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      licenses
        .filter((l) => match(l, where))
        .forEach((l) => Object.assign(l, data));
      return Promise.resolve({ count: 0 });
    },
  };
  const client = {
    intangibleBatch: { findMany: () => Promise.resolve(batches) },
    intangibleRecord: {
      findMany: ({ where }: { where: { batchId: string } }) =>
        Promise.resolve(records.filter((r) => r.batchId === where.batchId)),
    },
    softwareLicense,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ softwareLicense }),
  };
  return client as unknown as PrismaClient;
}

const siga = (
  code: string,
  description: string,
  status: 'active' | 'retired' = 'active',
): Rec => ({
  batchId: 'siga',
  patrimonialCode: code,
  description,
  brand: 'MICROSOFT',
  status,
  conditionNorm: null,
  expiresAt: null,
  initialValue: new Prisma.Decimal(100),
  poNumber: 1,
  poYear: 2024,
});
const coord = (
  code: string,
  description: string,
  condition: string | null,
  expires: string | null,
): Rec => ({
  ...siga(code, description),
  batchId: 'coord',
  status: null,
  conditionNorm: condition,
  expiresAt: expires ? new Date(`${expires}T00:00:00Z`) : null,
});

const NOW = new Date(2026, 8, 23); // 23/09/2026

describe('regenerateLicensesFromIntangibles', () => {
  it('normaliza la clave del grupo (tildes, espacios, mayúsculas)', () => {
    expect(licenseGroupKey('  Licencia  de Microsoft Próject ')).toBe(
      'LICENCIA DE MICROSOFT PROJECT',
    );
    expect(licenseGroupKey('')).toBeNull();
  });

  it('agrupa, calcula asientos y estado, y es idempotente', async () => {
    const records: Rec[] = [];
    for (let i = 0; i < 19; i++)
      records.push(siga(`P${i}`, 'LICENCIA DE MICROSOFT PROJECT PROFESIONAL'));
    records.push(
      siga('P-baja', 'LICENCIA DE MICROSOFT PROJECT PROFESIONAL', 'retired'),
    );
    records.push(
      siga('Z1', 'ZOOM'),
      coord('Z1', 'ZOOM', 'VIDA ÚTIL DEFINIDA', '2026-10-15'),
    );
    records.push(
      siga('V1', 'VIEJA'),
      coord('V1', 'VIEJA', 'VIDA ÚTIL DEFINIDA', '2025-01-01'),
    );
    records.push(
      siga('O1', 'ORACLE'),
      coord('O1', 'ORACLE', 'VIDA ÚTIL INDEFINIDA', null),
    );
    const licenses: Lic[] = [
      {
        id: 'm1',
        tenantId: 't',
        origin: 'manual',
        originKey: null,
        softwareName: 'Oracle DB EE',
        totalSeats: 5,
      },
    ];
    const prisma = fakePrisma(records, licenses);

    const first = await regenerateLicensesFromIntangibles(prisma, 't', NOW);
    expect(first).toEqual({ groups: 4, created: 4, updated: 0, retired: 0 });

    const byName = (n: string) => licenses.find((l) => l.softwareName === n)!;
    expect(byName('LICENCIA DE MICROSOFT PROJECT PROFESIONAL')).toMatchObject({
      totalSeats: 19,
      status: 'active',
    });
    expect(byName('ZOOM')).toMatchObject({
      status: 'expiring',
      licenseType: 'subscription',
    });
    expect(byName('VIEJA')).toMatchObject({ status: 'expired' });
    expect(byName('ORACLE')).toMatchObject({
      status: 'active',
      licenseType: 'perpetual',
      renewalDate: null,
    });

    const second = await regenerateLicensesFromIntangibles(prisma, 't', NOW);
    expect(second).toEqual({ groups: 4, created: 0, updated: 0, retired: 0 });
    expect(licenses).toHaveLength(5);
    // La licencia manual no se toca.
    expect(licenses.find((l) => l.id === 'm1')).toEqual({
      id: 'm1',
      tenantId: 't',
      origin: 'manual',
      originKey: null,
      softwareName: 'Oracle DB EE',
      totalSeats: 5,
    });
  });

  it('retira (sin borrar) los grupos que ya no tienen bienes vigentes', async () => {
    const records = [siga('A1', 'ADOBE')];
    const licenses: Lic[] = [];
    const prisma = fakePrisma(records, licenses);
    await regenerateLicensesFromIntangibles(prisma, 't', NOW);

    records[0].status = 'retired';
    const r = await regenerateLicensesFromIntangibles(prisma, 't', NOW);
    expect(r.updated).toBe(1);
    expect(licenses[0]).toMatchObject({ status: 'retired', totalSeats: 0 });

    records.length = 0; // el grupo desaparece de las versiones vigentes
    const gone = await regenerateLicensesFromIntangibles(prisma, 't', NOW);
    expect(gone.retired).toBe(0); // ya estaba retirada: no se cuenta dos veces
    expect(licenses).toHaveLength(1);
  });
});
