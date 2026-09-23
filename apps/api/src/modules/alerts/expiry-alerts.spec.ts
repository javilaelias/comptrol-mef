import type { PrismaClient } from '@prisma/client';
import { generateExpiryAlerts, pickThreshold } from './expiry-alerts';

type Lic = {
  id: string;
  softwareName: string;
  renewalDate: Date | null;
  status: string;
};
type Row = Record<string, unknown> & {
  id: string;
  targetId: string;
  thresholdDays: number;
  dueDate: Date;
  status: string;
};
type Rule = {
  enabled: boolean;
  daysBefore: number[];
  includeExpired: boolean;
} | null;

/** Base en memoria con lo mínimo que usa el generador (incluye la deduplicación del índice único). */
function fakePrisma(licenses: Lic[], alerts: Row[], rule: Rule = null) {
  let seq = 0;
  const key = (a: { targetId: string; thresholdDays: number; dueDate: Date }) =>
    `${a.targetId}|${a.thresholdDays}|${a.dueDate.toISOString()}`;
  const alert = {
    createMany: ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const d of data) {
        if (alerts.some((a) => key(a) === key(d))) continue; // skipDuplicates
        alerts.push({ ...d, id: `a${++seq}`, status: 'open' });
        count++;
      }
      return Promise.resolve({ count });
    },
    findMany: ({
      where,
    }: {
      where: { status: string; targetId?: { in: string[] } };
    }) =>
      Promise.resolve(
        alerts
          .filter(
            (a) =>
              a.status === where.status &&
              (!where.targetId || where.targetId.in.includes(a.targetId)),
          )
          .map((a) => ({ ...a })),
      ),
    updateMany: ({
      where,
      data,
    }: {
      where: { id: { in: string[] } };
      data: Record<string, unknown>;
    }) => {
      alerts
        .filter((a) => where.id.in.includes(a.id))
        .forEach((a) => Object.assign(a, data));
      return Promise.resolve({ count: where.id.in.length });
    },
  };
  return {
    alertRule: { findUnique: () => Promise.resolve(rule) },
    softwareLicense: {
      findMany: () =>
        Promise.resolve(
          licenses.filter(
            (l) =>
              l.renewalDate && !['retired', 'suspended'].includes(l.status),
          ),
        ),
    },
    alert,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ alert }),
  } as unknown as PrismaClient;
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NOW = new Date(2026, 8, 23); // 23/09/2026

describe('pickThreshold', () => {
  it('elige el umbral más cercano ya cruzado', () => {
    expect(pickThreshold(20, [90, 60, 30, 7], true)).toBe(30);
    expect(pickThreshold(7, [90, 60, 30, 7], true)).toBe(7);
    expect(pickThreshold(0, [90, 60, 30, 7], true)).toBe(7);
    expect(pickThreshold(120, [90, 60, 30, 7], true)).toBeNull();
  });
  it('las vencidas usan -1 solo si se incluyen', () => {
    expect(pickThreshold(-3, [30], true)).toBe(-1);
    expect(pickThreshold(-3, [30], false)).toBeNull();
  });
});

describe('generateExpiryAlerts', () => {
  it('crea una alerta por licencia y no duplica si corre dos veces', async () => {
    const licenses: Lic[] = [
      {
        id: 'L1',
        softwareName: 'ZOOM',
        renewalDate: d('2026-10-13'),
        status: 'expiring',
      }, // 20 días
      {
        id: 'L2',
        softwareName: 'VIEJA',
        renewalDate: d('2025-01-01'),
        status: 'expired',
      },
      {
        id: 'L3',
        softwareName: 'LEJANA',
        renewalDate: d('2028-01-01'),
        status: 'active',
      },
      {
        id: 'L4',
        softwareName: 'RETIRADA',
        renewalDate: d('2026-10-01'),
        status: 'retired',
      },
    ];
    const alerts: Row[] = [];
    const prisma = fakePrisma(licenses, alerts);

    expect(await generateExpiryAlerts(prisma, 't', NOW)).toEqual({
      enabled: true,
      created: 2,
      reopened: 0,
      autoResolved: 0,
    });
    expect(alerts.map((a) => [a.targetId, a.thresholdDays])).toEqual([
      ['L1', 30],
      ['L2', -1],
    ]);
    expect(await generateExpiryAlerts(prisma, 't', NOW)).toEqual({
      enabled: true,
      created: 0,
      reopened: 0,
      autoResolved: 0,
    });
    expect(alerts).toHaveLength(2);
  });

  it('al cruzar un umbral más cercano, la alerta anterior se cierra sola', async () => {
    const licenses: Lic[] = [
      {
        id: 'L1',
        softwareName: 'ZOOM',
        renewalDate: d('2026-10-13'),
        status: 'expiring',
      },
    ];
    const alerts: Row[] = [];
    const prisma = fakePrisma(licenses, alerts);
    await generateExpiryAlerts(prisma, 't', NOW); // 20 días → umbral 30
    const r = await generateExpiryAlerts(prisma, 't', new Date(2026, 9, 8)); // 5 días → umbral 7
    expect(r).toEqual({
      enabled: true,
      created: 1,
      reopened: 0,
      autoResolved: 1,
    });
    expect(alerts.find((a) => a.thresholdDays === 30)).toMatchObject({
      status: 'auto_resolved',
    });
    expect(alerts.find((a) => a.thresholdDays === 7)).toMatchObject({
      status: 'open',
    });
  });

  it('si el vencimiento se mueve fuera de los umbrales, la alerta abierta se resuelve por actualización', async () => {
    const licenses: Lic[] = [
      {
        id: 'L1',
        softwareName: 'ZOOM',
        renewalDate: d('2026-10-13'),
        status: 'expiring',
      },
    ];
    const alerts: Row[] = [];
    const prisma = fakePrisma(licenses, alerts);
    await generateExpiryAlerts(prisma, 't', NOW);
    licenses[0].renewalDate = d('2027-10-13'); // nueva versión del Excel: renovada por un año
    const r = await generateExpiryAlerts(prisma, 't', NOW);
    expect(r.autoResolved).toBe(1);
    expect(alerts[0]).toMatchObject({ status: 'auto_resolved' });
    expect(String(alerts[0].resolution)).toMatch(/actualización/);
  });

  it('una alerta atendida o descartada no se vuelve a crear', async () => {
    const licenses: Lic[] = [
      {
        id: 'L2',
        softwareName: 'VIEJA',
        renewalDate: d('2025-01-01'),
        status: 'expired',
      },
    ];
    const alerts: Row[] = [];
    const prisma = fakePrisma(licenses, alerts);
    await generateExpiryAlerts(prisma, 't', NOW);
    alerts[0].status = 'dismissed';
    expect((await generateExpiryAlerts(prisma, 't', NOW)).created).toBe(0);
  });

  it('respeta los umbrales configurados y la regla desactivada', async () => {
    const licenses: Lic[] = [
      {
        id: 'L1',
        softwareName: 'ZOOM',
        renewalDate: d('2026-10-13'),
        status: 'expiring',
      },
    ];
    const onlySeven = fakePrisma(licenses, [], {
      enabled: true,
      daysBefore: [7],
      includeExpired: true,
    });
    expect((await generateExpiryAlerts(onlySeven, 't', NOW)).created).toBe(0);
    const off = fakePrisma(licenses, [], {
      enabled: false,
      daysBefore: [30],
      includeExpired: true,
    });
    expect(await generateExpiryAlerts(off, 't', NOW)).toEqual({
      enabled: false,
      created: 0,
      reopened: 0,
      autoResolved: 0,
    });
  });

  it('una alerta cerrada sola se reabre si vuelve a corresponder', async () => {
    const licenses: Lic[] = [
      {
        id: 'L2',
        softwareName: 'VIEJA',
        renewalDate: d('2025-01-01'),
        status: 'expired',
      },
    ];
    const alerts: Row[] = [];
    await generateExpiryAlerts(fakePrisma(licenses, alerts), 't', NOW);
    // Se desactiva "alertar vencidas": la alerta se cierra sola.
    const sinVencidas = fakePrisma(licenses, alerts, {
      enabled: true,
      daysBefore: [30],
      includeExpired: false,
    });
    expect(
      (await generateExpiryAlerts(sinVencidas, 't', NOW)).autoResolved,
    ).toBe(1);
    // Se vuelve a activar: se reabre la misma alerta (no se crea otra).
    const r = await generateExpiryAlerts(
      fakePrisma(licenses, alerts),
      't',
      NOW,
    );
    expect(r).toMatchObject({ created: 0, reopened: 1 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ status: 'open', resolution: null });
  });
});
