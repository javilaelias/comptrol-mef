'use client';

import React from 'react';

export type StaleAsset = {
  id: string;
  assetTag: string;
  hostname: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  location?: {
    name: string;
    site?: { name: string } | null;
  } | null;
};

export type EwasteTrendPoint = { month: string; count: number };

export type InventoryBySiteRow = {
  siteId: string | null;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  assetCount: number;
  inventoryValue: number;
};

function formatDate(value: string | null) {
  if (!value) return 'Nunca';
  const d = new Date(value);
  return d.toLocaleString('es-PE');
}

function formatCurrency(amount: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ReportsPanel({
  staleAssets,
  ewasteTrend,
  inventoryBySite,
}: {
  staleAssets: StaleAsset[];
  ewasteTrend: EwasteTrendPoint[];
  inventoryBySite: InventoryBySiteRow[];
}) {
  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        <h2 className="text-base font-semibold text-slate-900">Operativa: Activos sin “last seen” (&gt; 30 días)</h2>
        <p className="mt-1 text-sm text-slate-600">Primeros 10 resultados.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Asset Tag</th>
                <th className="py-2 pr-3 font-medium">Host</th>
                <th className="py-2 pr-3 font-medium">IP</th>
                <th className="py-2 pr-3 font-medium">Última vez</th>
                <th className="py-2 pr-3 font-medium">Sede / Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {staleAssets.slice(0, 10).map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">{a.assetTag}</td>
                  <td className="py-2 pr-3 text-slate-700">{a.hostname ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{a.ipAddress ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-700">{formatDate(a.lastSeenAt)}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {(a.location?.site?.name ?? 'Sin sede') + ' / ' + (a.location?.name ?? 'Sin ubicación')}
                  </td>
                </tr>
              ))}
              {staleAssets.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={5}>
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Táctica: Tendencia e‑Waste (mensual)</h2>
        <div className="mt-4 space-y-2">
          {ewasteTrend.slice(-8).map((p) => (
            <div key={p.month} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">{p.month}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-900">
                {p.count.toLocaleString('es-PE')}
              </span>
            </div>
          ))}
          {ewasteTrend.length === 0 && <p className="text-sm text-slate-600">Sin datos.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
        <h2 className="text-base font-semibold text-slate-900">Gerencial: Valor de inventario por sede</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Sede</th>
                <th className="py-2 pr-3 font-medium">Activos</th>
                <th className="py-2 pr-3 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {inventoryBySite.map((r) => (
                <tr key={r.siteId ?? r.siteName} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">{r.siteName}</td>
                  <td className="py-2 pr-3 text-slate-700">{r.assetCount.toLocaleString('es-PE')}</td>
                  <td className="py-2 pr-3 text-slate-700">{formatCurrency(r.inventoryValue, 'PEN')}</td>
                </tr>
              ))}
              {inventoryBySite.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-600" colSpan={3}>
                    Sin datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
