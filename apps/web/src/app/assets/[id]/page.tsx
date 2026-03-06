'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { useRequireAuth } from '@/lib/requireAuth';
import { TopNav } from '@/components/TopNav';

type Asset = {
  id: string;
  assetTag: string;
  inventoryCode: string | null;
  description: string | null;
  serialNumber: string | null;
  vendor: string | null;
  model: string | null;
  assetType: string;
  status: string;
  conditionLabel: string | null;
  acquisitionYear: number | null;
  orgUnitId: string | null;
  orgUnit?: { id: string; name: string } | null;
};

type OrgUnit = { id: string; name: string };

export default function AssetDetailPage() {
  const router = useRouter();
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    assetTag: '',
    inventoryCode: '',
    description: '',
    status: 'in_use',
    conditionLabel: '',
    acquisitionYear: '',
    orgUnitId: '',
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [a, units] = await Promise.all([
          apiFetch<Asset>(`/assets/${id}`),
          apiFetch<OrgUnit[]>(`/catalog/org-units`),
        ]);
        if (cancelled) return;
        setAsset(a);
        setOrgUnits(units);
        setForm({
          assetTag: a.assetTag,
          inventoryCode: a.inventoryCode ?? '',
          description: a.description ?? '',
          status: a.status,
          conditionLabel: a.conditionLabel ?? '',
          acquisitionYear: a.acquisitionYear ? String(a.acquisitionYear) : '',
          orgUnitId: a.orgUnitId ?? '',
        });
      } catch (err: any) {
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
  }, [id, router]);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-3xl">
        <TopNav title="Activos" />
        <Link className="text-sm text-slate-700 underline" href="/assets">
          ← Volver al listado
        </Link>

        {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}
        {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {asset && (
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-base font-semibold text-slate-900">Editar activo</h1>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Asset Tag</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.assetTag}
                  onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Código inventario</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.inventoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, inventoryCode: e.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Descripción</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Estado</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {['in_use', 'in_stock', 'repair', 'retired', 'disposed', 'lost'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Condición</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.conditionLabel}
                  onChange={(e) => setForm((f) => ({ ...f, conditionLabel: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Año adquisición</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.acquisitionYear}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionYear: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Dependencia</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={form.orgUnitId}
                  onChange={(e) => setForm((f) => ({ ...f, orgUnitId: e.target.value }))}
                >
                  <option value="">—</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    await apiFetch(`/assets/${asset.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        assetTag: form.assetTag.trim(),
                        inventoryCode: form.inventoryCode.trim() || null,
                        description: form.description.trim() || null,
                        status: form.status,
                        conditionLabel: form.conditionLabel.trim() || null,
                        acquisitionYear: form.acquisitionYear ? Number(form.acquisitionYear) : null,
                        orgUnitId: form.orgUnitId || null,
                      }),
                    });
                    router.push('/assets');
                  } catch (err: any) {
                    setError(String(err?.message ?? err));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => router.push('/assets')}
              >
                Cancelar
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
