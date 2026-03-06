'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { ItamKpiDashboard, type DashboardMetrics } from '@/features/dashboard/components/ItamKpiDashboard';
import { ReportsPanel, type EwasteTrendPoint, type InventoryBySiteRow, type StaleAsset } from '@/features/dashboard/components/ReportsPanel';
import { TopNav } from '@/components/TopNav';
import { EnadSummaryPanel, type EnadSummary } from '@/features/dashboard/components/EnadSummaryPanel';
import { PeruAssetsMap } from '@/features/dashboard/components/PeruAssetsMap';

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [staleAssets, setStaleAssets] = useState<StaleAsset[]>([]);
  const [ewasteTrend, setEwasteTrend] = useState<EwasteTrendPoint[]>([]);
  const [inventoryBySite, setInventoryBySite] = useState<InventoryBySiteRow[]>([]);
  const [enadSummary, setEnadSummary] = useState<EnadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [m, s, e, i, enad] = await Promise.all([
          apiFetch<DashboardMetrics>('/dashboard/metrics'),
          apiFetch<StaleAsset[]>('/reports/operational/stale-assets?days=30&limit=100'),
          apiFetch<EwasteTrendPoint[]>('/reports/tactical/ewaste-trend?months=12'),
          apiFetch<InventoryBySiteRow[]>('/reports/gerencial/inventory-value-by-site'),
          apiFetch<EnadSummary>('/enad/summary'),
        ]);

        if (cancelled) return;
        setMetrics(m);
        setStaleAssets(s);
        setEwasteTrend(e);
        setInventoryBySite(i);
        setEnadSummary(enad);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 401) {
          clearToken();
          router.push('/login');
          return;
        }
        setError(String(err?.message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-6xl">
        <TopNav title="Dashboard" />

        {loading && <p className="mt-6 text-sm text-slate-600">Cargando…</p>}
        {error && <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {metrics && (
          <>
            <div className="mt-4">
              <ItamKpiDashboard metrics={metrics} />
            </div>
            {enadSummary && <EnadSummaryPanel summary={enadSummary} />}
            <PeruAssetsMap rows={inventoryBySite} />
            <ReportsPanel staleAssets={staleAssets} ewasteTrend={ewasteTrend} inventoryBySite={inventoryBySite} />
          </>
        )}
      </div>
    </main>
  );
}
