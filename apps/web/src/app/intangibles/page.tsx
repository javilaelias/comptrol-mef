'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { useRequireAuth } from '@/lib/requireAuth';
import { TopNav } from '@/components/TopNav';
import { ListTab } from './ListTab';
import { ReconciliationTab } from './ReconciliationTab';
import { VersionsTab } from './VersionsTab';
import { formatDate, type ReconciliationSummary } from './types';
import { ErrorBox } from './ui';

const TABS = [
  { key: 'list', label: 'Listado' },
  { key: 'reconciliation', label: 'Comparación SIGA vs Excel' },
  { key: 'versions', label: 'Versiones y subida' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function IntangiblesPage() {
  const router = useRouter();
  useRequireAuth();
  const [tab, setTab] = useState<TabKey>('list');
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await apiFetch<ReconciliationSummary>('/intangibles/reconciliation/summary'));
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  useEffect(() => {
    let alive = true;
    apiFetch<ReconciliationSummary>('/intangibles/reconciliation/summary')
      .then((s) => alive && setSummary(s))
      .catch(handleError);
    return () => {
      alive = false;
    };
  }, [handleError]);

  const cuts = summary?.cuts;

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-7xl">
        <TopNav title="Intangibles" />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-slate-900">Intangibles: licencias y software patrimonial</h1>
              <p className="mt-1 text-sm text-slate-600">
                Datos base de SIGA + condición, vencimiento y justificación del Excel del coordinador de infraestructura.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-slate-500">Corte SIGA</dt>
              <dd className="font-medium text-slate-900">{cuts?.siga ? formatDate(cuts.siga.cutDate) : 'sin carga'}</dd>
              <dt className="text-slate-500">Corte Excel</dt>
              <dd className="font-medium text-slate-900" title={cuts?.coordinator?.fileName ?? undefined}>
                {cuts?.coordinator ? formatDate(cuts.coordinator.cutDate) : 'sin subir'}
              </dd>
            </dl>
          </div>

          {cuts?.excelNewerThanSiga && (
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              El Excel del coordinador ({formatDate(cuts.coordinator?.cutDate)}) es más reciente que el corte de SIGA (
              {formatDate(cuts.siga?.cutDate)}). &quot;Solo en Excel&quot; puede incluir bienes que SIGA todavía no refleja:
              conviene cargar un corte de SIGA más reciente.
            </p>
          )}

          <ErrorBox message={error} />

          <nav className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
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
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'list' && <ListTab onError={handleError} />}
          {tab === 'reconciliation' && <ReconciliationTab summary={summary} onError={handleError} />}
          {tab === 'versions' && <VersionsTab onError={handleError} onChanged={loadSummary} />}
        </section>
      </div>
    </main>
  );
}
