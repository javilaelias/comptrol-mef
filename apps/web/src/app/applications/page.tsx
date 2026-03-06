'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { useRequireAuth } from '@/lib/requireAuth';
import { TopNav } from '@/components/TopNav';

type Application = {
  id: string;
  name: string;
  ownerOrgUnit: string | null;
  status: string | null;
  lastUpdateYear: number | null;
};

type ListResponse = { items: Application[]; total: number; take: number; skip: number };

export default function ApplicationsPage() {
  const router = useRouter();
  useRequireAuth();
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      q.set('take', '50');
      q.set('skip', '0');
      setData(await apiFetch<ListResponse>(`/applications?${q.toString()}`));
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-6xl">
        <TopNav title="Apps" />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900">Catálogo de aplicaciones (ENAD/MEF)</h1>
          <div className="mt-4 flex items-center gap-2">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="Buscar por nombre / UO / estado…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') load();
              }}
            />
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => load()}
            >
              Buscar
            </button>
          </div>

          {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

          {data && (
            <>
              <p className="mt-4 text-sm text-slate-600">
                Total: <span className="font-medium text-slate-900">{data.total.toLocaleString('es-PE')}</span>
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-600">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-medium">Nombre</th>
                      <th className="py-2 pr-3 font-medium">UO propietaria</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Últ. actualización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-slate-900">{a.name}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.ownerOrgUnit ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.status ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{a.lastUpdateYear ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
