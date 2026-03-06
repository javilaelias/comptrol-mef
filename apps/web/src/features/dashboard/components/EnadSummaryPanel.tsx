'use client';

import React from 'react';
import Link from 'next/link';

export type EnadSummary = {
  available: boolean;
  survey?: { year: number; asOfDate: string; sourceDocument: string };
  institutional?: {
    personnel: { code: string | null; label: string | null };
    telework: { code: string | null; label: string | null };
  };
  devices?: {
    desktops: { value1: number; value2: number; total: number };
    laptops: { value1: number; value2: number; total: number };
    tabletsTotal: number;
  };
  availability?: {
    desktops: { inUse: number; avgAgeYears: number; noUse: number; notOperational: number };
    laptops: { inUse: number; avgAgeYears: number; noUse: number; notOperational: number };
    tablets: { inUse: number; avgAgeYears: number; noUse: number; notOperational: number };
  };
  cpuTop?: {
    desktops: Array<{ processor: string; windows: number; linux: number }>;
    laptops: Array<{ processor: string; windows: number; linux: number }>;
  };
  cmdb?: {
    assetsByType: Record<string, number>;
  };
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function CpuTable({ title, rows }: { title: string; rows: Array<{ processor: string; windows: number; linux: number }> }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">Windows / Linux</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="py-2 pr-3">CPU</th>
              <th className="py-2 pr-3">Windows</th>
              <th className="py-2 pr-3">Linux</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.processor} className="border-b border-slate-50">
                <td className="py-2 pr-3 text-slate-800">{r.processor}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-800">{r.windows.toLocaleString('es-PE')}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-800">{r.linux.toLocaleString('es-PE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EnadSummaryPanel({ summary }: { summary: EnadSummary }) {
  if (!summary.available) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ENAD 2025</h2>
        <p className="mt-1 text-sm text-slate-600">
          No hay datos ENAD importados. Ejecuta <code className="rounded bg-slate-100 px-1 py-0.5">npm run import:enad</code>.
        </p>
      </section>
    );
  }

  const year = summary.survey?.year ?? 2025;
  const missingInstitutional = !summary.institutional?.personnel?.code || !summary.institutional?.telework?.code;

  return (
    <section className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">ENAD {year} (cierre {summary.survey?.asOfDate})</h2>
          <p className="mt-1 text-xs text-slate-500">{summary.survey?.sourceDocument}</p>
        </div>
        <Link
          href="/enad"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Configurar ENAD
        </Link>
      </div>

      {missingInstitutional && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          Falta completar respuestas manuales (Personal / Teletrabajo). Entra a “Configurar ENAD”.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label="PC escritorio (ENAD, en uso)" value={(summary.availability?.desktops.inUse ?? 0).toLocaleString('es-PE')} />
        <StatCard label="Laptops (ENAD, en uso)" value={(summary.availability?.laptops.inUse ?? 0).toLocaleString('es-PE')} />
        <StatCard label="Tablets (ENAD, en uso)" value={(summary.availability?.tablets.inUse ?? 0).toLocaleString('es-PE')} />
        <StatCard label="Personal (ENAD)" value={summary.institutional?.personnel.label ?? 'N/D'} />
        <StatCard label="Teletrabajo (ENAD)" value={summary.institutional?.telework.label ?? 'N/D'} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CpuTable title="CPU PCs escritorio (Top)" rows={summary.cpuTop?.desktops ?? []} />
        <CpuTable title="CPU Laptops (Top)" rows={summary.cpuTop?.laptops ?? []} />
      </div>
    </section>
  );
}
