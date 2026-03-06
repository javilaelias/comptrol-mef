'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { TopNav } from '@/components/TopNav';

type AssetListItem = {
  id: string;
  assetTag: string;
  description: string | null;
  assetType: string;
  status: string;
  updatedAt: string;
  location?: { name: string; site?: { name: string } | null } | null;
  orgUnit?: { name: string } | null;
};

type AssetListResponse = {
  items: AssetListItem[];
  total: number;
  take: number;
  skip: number;
};

const ASSET_TYPES = [
  'desktop',
  'laptop',
  'server',
  'network',
  'mobile',
  'iot',
  'ot',
  'virtual_machine',
  'cloud_resource',
  'other',
] as const;

export default function AssetsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [data, setData] = useState<AssetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createAssetTag, setCreateAssetTag] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createType, setCreateType] = useState<(typeof ASSET_TYPES)[number]>('desktop');
  const [creating, setCreating] = useState(false);

  const page = useMemo(() => {
    if (!data) return 0;
    return Math.floor(data.skip / data.take) + 1;
  }, [data]);

  async function load(skip = 0) {
    setError(null);
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      q.set('take', '50');
      q.set('skip', String(skip));

      const res = await apiFetch<AssetListResponse>(`/assets?${q.toString()}`);
      setData(res);
    } catch (err: any) {
      if (err?.status === 401) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-6xl">
        <TopNav title="Activos" />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900">CRUD Operativo: Activos</h1>
          <p className="mt-1 text-sm text-slate-600">Datos importados + creación manual (demo).</p>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <input
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Asset Tag (ej. 740805000951)"
              value={createAssetTag}
              onChange={(e) => setCreateAssetTag(e.target.value)}
            />
            <select
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={createType}
              onChange={(e) => setCreateType(e.target.value as any)}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Descripción"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
            <div className="md:col-span-4 flex items-center gap-2">
              <button
                disabled={creating || !createAssetTag.trim()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  setCreating(true);
                  try {
                    await apiFetch('/assets', {
                      method: 'POST',
                      body: JSON.stringify({
                        assetTag: createAssetTag.trim(),
                        assetType: createType,
                        description: createDescription.trim() || undefined,
                      }),
                    });
                    setCreateAssetTag('');
                    setCreateDescription('');
                    await load(0);
                  } catch (err: any) {
                    setError(String(err?.message ?? err));
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? 'Creando…' : 'Crear activo'}
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => load(0)}
              >
                Refrescar
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Buscar por asset tag, inventario, serie, host, descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') load(0);
              }}
            />
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => load(0)}
            >
              Buscar
            </button>
          </div>

          {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

          {data && (
            <>
              <p className="mt-4 text-sm text-slate-600">
                Total: <span className="font-medium text-slate-900">{data.total.toLocaleString('es-PE')}</span> — Página{' '}
                <span className="font-medium text-slate-900">{page}</span>
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-600">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Asset Tag</th>
                      <th className="py-2 pr-3 font-medium">Descripción</th>
                      <th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Sede / Ubicación</th>
                      <th className="py-2 pr-3 font-medium">Dependencia</th>
                      <th className="py-2 pr-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-slate-900">{a.assetTag}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.description ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.assetType}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.status}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {(a.location?.site?.name ?? 'Sin sede') + ' / ' + (a.location?.name ?? 'Sin ubicación')}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{a.orgUnit?.name ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          <div className="flex items-center gap-2">
                            <Link className="underline" href={`/assets/${a.id}`}>
                              Ver/Editar
                            </Link>
                            <button
                              className="text-rose-700 underline"
                              onClick={async () => {
                                if (!confirm(`¿Retirar el activo ${a.assetTag}?`)) return;
                                try {
                                  await apiFetch(`/assets/${a.id}`, { method: 'DELETE' });
                                  await load(data.skip);
                                } catch (err: any) {
                                  setError(String(err?.message ?? err));
                                }
                              }}
                            >
                              Retirar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  disabled={!data || data.skip === 0}
                  onClick={() => load(Math.max(0, data.skip - data.take))}
                >
                  Anterior
                </button>
                <button
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  disabled={!data || data.skip + data.take >= data.total}
                  onClick={() => load(data.skip + data.take)}
                >
                  Siguiente
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
