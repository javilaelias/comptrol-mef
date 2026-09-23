'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { useRequireAuth } from '@/lib/requireAuth';
import { ALERTS_CHANGED_EVENT, TopNav } from '@/components/TopNav';
import { formatDate } from '../intangibles/types';
import { buttonClass, ErrorBox, inputClass, Pager, primaryButtonClass } from '../intangibles/ui';

type AlertStatus = 'open' | 'acknowledged' | 'dismissed' | 'auto_resolved';

type AlertItem = {
  id: string;
  title: string;
  thresholdDays: number;
  dueDate: string;
  status: AlertStatus;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedBy: { fullName: string } | null;
  license: { id: string; softwareName: string; totalSeats: number; status: string; origin: string } | null;
};

type Counts = { open: number; acknowledged: number; dismissed: number; autoResolved: number };
type Rules = { daysBefore: number[]; includeExpired: boolean; enabled: boolean; canEdit: boolean };

const TAKE = 50;

const TABS: Array<{ key: AlertStatus; label: string; count: (c: Counts) => number }> = [
  { key: 'open', label: 'Abiertas', count: (c) => c.open },
  { key: 'acknowledged', label: 'Atendidas', count: (c) => c.acknowledged },
  { key: 'dismissed', label: 'Descartadas', count: (c) => c.dismissed },
  { key: 'auto_resolved', label: 'Cerradas solas', count: (c) => c.autoResolved },
];

function daysLeft(dueDate: string): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${dueDate}T00:00:00Z`) - today) / 86_400_000);
}

function situation(a: AlertItem): { text: string; className: string } {
  const d = daysLeft(a.dueDate);
  if (d < 0) return { text: `Vencida hace ${(-d).toLocaleString('es-PE')} días`, className: 'bg-rose-100 text-rose-800' };
  if (d === 0) return { text: 'Vence hoy', className: 'bg-rose-100 text-rose-800' };
  return {
    text: `Vence en ${d.toLocaleString('es-PE')} días`,
    className: d <= 30 ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900',
  };
}

export default function AlertsPage() {
  const router = useRouter();
  useRequireAuth();
  const [tab, setTab] = useState<AlertStatus>('open');
  const [data, setData] = useState<{ total: number; items: AlertItem[] } | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [daysText, setDaysText] = useState('');
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (getErrorStatus(err) === 401) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(getErrorMessage(err));
    },
    [router],
  );

  const load = useCallback(
    async (nextSkip: number) => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ status: tab, take: String(TAKE), skip: String(nextSkip) });
        const [list, c] = await Promise.all([
          apiFetch<{ total: number; items: AlertItem[] }>(`/alerts?${q.toString()}`),
          apiFetch<Counts>('/alerts/count'),
        ]);
        setData(list);
        setCounts(c);
        setSkip(nextSkip);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [tab, handleError],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  useEffect(() => {
    let alive = true;
    apiFetch<Rules>('/alerts/rules')
      .then((r) => {
        if (!alive) return;
        setRules(r);
        setDaysText(r.daysBefore.join(', '));
      })
      .catch(handleError);
    return () => {
      alive = false;
    };
  }, [handleError]);

  async function resolve(a: AlertItem, action: 'acknowledge' | 'dismiss') {
    try {
      await apiFetch(`/alerts/${a.id}/${action}`, { method: 'POST' });
      window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      await load(skip);
    } catch (err) {
      handleError(err);
    }
  }

  async function saveRules() {
    if (!rules) return;
    const daysBefore = [...new Set(daysText.split(/[,\s;]+/).filter(Boolean).map(Number))];
    if (!daysBefore.length || daysBefore.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) {
      setError('Los días de anticipación deben ser números enteros entre 1 y 365, separados por comas.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<Rules & { generated: { created: number; autoResolved: number } }>('/alerts/rules', {
        method: 'PUT',
        body: JSON.stringify({ daysBefore, includeExpired: rules.includeExpired, enabled: rules.enabled }),
      });
      setRules(r);
      setDaysText(r.daysBefore.join(', '));
      setNotice(
        `Configuración guardada. Revisión inmediata: ${r.generated.created} alertas nuevas, ${r.generated.autoResolved} cerradas solas.`,
      );
      window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      await load(0);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-6xl">
        <TopNav title="Alertas" />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900">Alertas de vencimiento</h1>
          <p className="mt-1 text-sm text-slate-600">
            Todos los días a las 07:00 se revisan las fechas de renovación de las{' '}
            <Link className="underline" href="/licenses">
              licencias
            </Link>
            . También se revisan al subir el Excel del coordinador o cargar un corte de SIGA. Cada licencia genera una
            alerta al cruzar un umbral de anticipación; si la fecha cambia, la alerta se cierra sola.
          </p>

          <nav className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'rounded-xl border px-3 py-2 text-sm font-semibold',
                  tab === t.key
                    ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)] text-white'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
                ].join(' ')}
              >
                {t.label} {counts ? `(${t.count(counts).toLocaleString('es-PE')})` : ''}
              </button>
            ))}
          </nav>

          <ErrorBox message={error} />
          {notice && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
          )}
          {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

          {data && !loading && data.total === 0 && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {tab === 'open' ? 'No hay alertas abiertas.' : 'No hay alertas en este estado.'}
            </p>
          )}

          {data && data.total > 0 && (
            <>
              <ul className="mt-4 divide-y divide-slate-200">
                {data.items.map((a) => {
                  const s = situation(a);
                  return (
                    <li key={a.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{a.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.text}</span>
                          <span>Renovación: {formatDate(a.dueDate)}</span>
                          {a.thresholdDays > 0 && <span>· Umbral de {a.thresholdDays} días</span>}
                          {a.license && <span>· {a.license.totalSeats.toLocaleString('es-PE')} asientos</span>}
                        </p>
                        {a.status !== 'open' && (
                          <p className="mt-1 text-xs text-slate-500">
                            {a.resolution ??
                              `${a.status === 'acknowledged' ? 'Atendida' : 'Descartada'} por ${a.resolvedBy?.fullName ?? '—'}`}
                            {a.resolvedAt && ` · ${new Date(a.resolvedAt).toLocaleString('es-PE')}`}
                          </p>
                        )}
                      </div>
                      {a.status === 'open' && (
                        <div className="flex gap-2">
                          <button className={primaryButtonClass} onClick={() => resolve(a, 'acknowledge')}>
                            Atender
                          </button>
                          <button className={buttonClass} onClick={() => resolve(a, 'dismiss')}>
                            Descartar
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pager total={data.total} take={TAKE} skip={skip} onChange={load} />
            </>
          )}
        </section>

        {rules && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Configuración</h2>
            {!rules.canEdit && (
              <p className="mt-1 text-sm text-slate-600">Solo los administradores de Comptrol pueden cambiarla.</p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <label className="text-sm text-slate-700">
                Avisar con estos días de anticipación
                <input
                  className={`${inputClass} mt-1 block w-56`}
                  value={daysText}
                  disabled={!rules.canEdit}
                  onChange={(e) => setDaysText(e.target.value)}
                  placeholder="90, 60, 30, 7"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rules.includeExpired}
                  disabled={!rules.canEdit}
                  onChange={(e) => setRules({ ...rules, includeExpired: e.target.checked })}
                />
                Alertar también las ya vencidas
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rules.enabled}
                  disabled={!rules.canEdit}
                  onChange={(e) => setRules({ ...rules, enabled: e.target.checked })}
                />
                Alertas activadas
              </label>
              {rules.canEdit && (
                <button className={primaryButtonClass} disabled={saving} onClick={saveRules}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
