'use client';

import React from 'react';

type KpiKey = 'totalAssets' | 'inactiveLicenses' | 'ewasteCandidates' | 'inventoryValue';

export interface DashboardMetrics {
  totalAssets: number;
  inactiveLicenses: number;
  ewasteCandidates: number;
  inventoryValue: number;
}

interface KpiCardProps {
  label: string;
  value: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
}

const toneMap: Record<KpiCardProps['tone'], string> = {
  neutral: 'border-[color:var(--color-border)] bg-white',
  warning: 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-weak)]',
  danger: 'border-red-300 bg-red-50',
  success: 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-weak)]',
};

function KpiCard({ label, value, tone }: KpiCardProps) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneMap[tone]}`}>
      <p className="text-sm font-semibold text-black/70">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-black">{value}</p>
    </div>
  );
}

function formatCurrency(amount: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface ItamKpiDashboardProps {
  metrics: DashboardMetrics;
}

export const ItamKpiDashboard: React.FC<ItamKpiDashboardProps> = ({ metrics }) => {
  const cards: Array<{ key: KpiKey; label: string; value: string; tone: KpiCardProps['tone'] }> = [
    {
      key: 'totalAssets',
      label: 'Total de Activos',
      value: metrics.totalAssets.toLocaleString('es-PE'),
      tone: 'neutral',
    },
    {
      key: 'inactiveLicenses',
      label: 'Licencias registradas (Total)',
      value: metrics.inactiveLicenses.toLocaleString('es-PE'),
      tone: 'neutral',
    },
    {
      key: 'ewasteCandidates',
      label: 'Equipos para e‑Waste',
      value: metrics.ewasteCandidates.toLocaleString('es-PE'),
      tone: metrics.ewasteCandidates > 50 ? 'danger' : 'neutral',
    },
    {
      key: 'inventoryValue',
      label: 'Valor Total del Inventario',
      value: formatCurrency(metrics.inventoryValue, 'PEN'),
      tone: 'neutral',
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-black">Comptrol‑MEF</h1>
          <p className="mt-1 text-sm text-black/80">Gestión de recursos informáticos (demo).</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.key} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>
    </section>
  );
};
