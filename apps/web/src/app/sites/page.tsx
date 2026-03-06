'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { TopNav } from '@/components/TopNav';

type SiteRow = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  assetCount: number;
};

export default function SitesPage() {
  const router = useRouter();
  const [items, setItems] = useState<SiteRow[]>([]);
  const [filter, setFilter] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const rows = await apiFetch<SiteRow[]>('/sites');
        if (cancelled) return;
        setItems(rows);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 401) {
          clearToken();
          router.push('/login');
          return;
        }
        setError(String(err?.message ?? err));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => (s.name ?? '').toLowerCase().includes(q) || (s.code ?? '').toLowerCase().includes(q));
  }, [items, filter]);

  function updateLocal(id: string, patch: Partial<SiteRow>) {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveGeo(row: SiteRow) {
    setSavingId(row.id);
    setError(null);
    try {
      await apiFetch(`/sites/${row.id}/geo`, {
        method: 'PATCH',
        body: JSON.stringify({ latitude: row.latitude, longitude: row.longitude }),
      });
    } catch (err: any) {
      if (err?.status === 401) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(String(err?.message ?? err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-6xl">
        <TopNav title="Sedes (Mapa)" />

        <section className="rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
          <h1 className="text-xl font-extrabold tracking-tight text-black">Configuración del mapa</h1>
          <p className="mt-2 text-sm text-black/80">
            El dashboard muestra un mapa del Perú con la distribución de activos por sede. Aquí puedes definir coordenadas reales (lat/lon) por sede para mejorar la
            precisión.
          </p>
        </section>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <input
            className="w-full max-w-md rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black"
            placeholder="Buscar sede…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-black hover:border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-weak)]"
            onClick={() => router.push('/dashboard')}
          >
            Ver dashboard
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] bg-black/[0.02] text-xs font-semibold uppercase tracking-wide text-black/70">
                <th className="px-4 py-3">Sede</th>
                <th className="px-4 py-3">Activos</th>
                <th className="px-4 py-3">Latitud</th>
                <th className="px-4 py-3">Longitud</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-extrabold text-black">{s.name}</p>
                    <p className="text-xs text-black/60">
                      {s.code ? `Código: ${s.code}` : '—'} {s.city ? `• ${s.city}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-black">{s.assetCount.toLocaleString('es-PE')}</td>
                  <td className="px-4 py-3">
                    <input
                      className="w-40 rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm tabular-nums text-black"
                      placeholder="-12.046"
                      value={s.latitude ?? ''}
                      onChange={(e) => updateLocal(s.id, { latitude: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-40 rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm tabular-nums text-black"
                      placeholder="-77.043"
                      value={s.longitude ?? ''}
                      onChange={(e) => updateLocal(s.id, { longitude: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-extrabold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => saveGeo(s)}
                      disabled={savingId === s.id}
                    >
                      {savingId === s.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-black/70" colSpan={5}>
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

