'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { TopNav } from '@/components/TopNav';
import type { EnadSummary } from '@/features/dashboard/components/EnadSummaryPanel';

type EnadItemsResponse = {
  available: boolean;
  survey?: { year: number };
  items: Array<{ code: string; label: string; questionCode: number }>;
};

type ManualAnswersResponse = {
  available: boolean;
  answers: Array<{ questionCode: number; selectedOptionCodes: string[]; answerText: string | null }>;
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-black/[0.03] p-4 text-xs text-black">
      <code>{children}</code>
    </pre>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-black/70">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-black">{value}</p>
    </div>
  );
}

export default function EnadConfigPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<EnadSummary | null>(null);
  const [opts10, setOpts10] = useState<Array<{ code: string; label: string }>>([]);
  const [opts11, setOpts11] = useState<Array<{ code: string; label: string }>>([]);
  const [sel10, setSel10] = useState<string>('');
  const [sel11, setSel11] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const year = useMemo(() => summary?.survey?.year ?? null, [summary?.survey?.year]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const s = await apiFetch<EnadSummary>('/enad/summary');
        if (cancelled) return;
        setSummary(s);
        if (!s.available || !s.survey) return;

        const [i10, i11, ma] = await Promise.all([
          apiFetch<EnadItemsResponse>(`/enad/surveys/${s.survey.year}/items?questionCode=10`),
          apiFetch<EnadItemsResponse>(`/enad/surveys/${s.survey.year}/items?questionCode=11`),
          apiFetch<ManualAnswersResponse>(`/enad/surveys/${s.survey.year}/manual-answers`),
        ]);

        if (cancelled) return;
        setOpts10((i10.items ?? []).map((x) => ({ code: x.code, label: x.label })));
        setOpts11((i11.items ?? []).map((x) => ({ code: x.code, label: x.label })));

        const map = new Map((ma.answers ?? []).map((a) => [a.questionCode, a]));
        setSel10(map.get(10)?.selectedOptionCodes?.[0] ?? '');
        setSel11(map.get(11)?.selectedOptionCodes?.[0] ?? '');
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

  async function save() {
    if (!year) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        apiFetch(`/enad/surveys/${year}/manual-answers/10`, {
          method: 'PUT',
          body: JSON.stringify({ selectedOptionCodes: sel10 ? [sel10] : [] }),
        }),
        apiFetch(`/enad/surveys/${year}/manual-answers/11`, {
          method: 'PUT',
          body: JSON.stringify({ selectedOptionCodes: sel11 ? [sel11] : [] }),
        }),
      ]);
      const s = await apiFetch<EnadSummary>('/enad/summary');
      setSummary(s);
      router.push('/dashboard');
    } catch (err: any) {
      if (err?.status === 401) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-5xl">
        <TopNav title="ENAD" />

        {error && (
          <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>
        )}

        <section className="rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
          <h1 className="text-xl font-extrabold tracking-tight text-black">ENAD (Encuesta Nacional de Activos Digitales)</h1>
          <p className="mt-2 text-sm text-black/80">
            Esta sección convierte la encuesta ENAD en métricas operativas para el dashboard. Algunas preguntas son automáticas (valores numéricos) y otras requieren
            confirmación manual (checkbox).
          </p>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-black">Paso 1 — Importar ENAD</h2>
            <p className="mt-2 text-sm text-black/80">Importa el PDF ubicado en la carpeta `docs`.</p>

            <div className="mt-3 grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/60">PowerShell</p>
              <CodeBlock>{`$env:IMPORT_RESET=1\nnpm run import:enad`}</CodeBlock>
              <p className="text-xs font-semibold uppercase tracking-wide text-black/60">CMD</p>
              <CodeBlock>{`set IMPORT_RESET=1 && npm run import:enad`}</CodeBlock>
            </div>

            {!summary?.available && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                Estado: no importado.
              </div>
            )}

            {summary?.available && summary.survey && (
              <div className="mt-3 rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3">
                <p className="text-sm font-extrabold text-black">Estado: importado</p>
                <p className="mt-1 text-xs text-black/70">
                  Fuente: {summary.survey.sourceDocument} — ENAD {summary.survey.year} (cierre {summary.survey.asOfDate})
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-black">Paso 2 — Qué se calcula automáticamente</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-black/85">
              <li>PC escritorio y laptops por tipo de CPU (Windows/Linux).</li>
              <li>Tablets por sistema operativo (Windows/Android/iOS).</li>
              <li>Disponibilidad por tipo: en uso, sin uso, no operativos y antigüedad promedio (años).</li>
              <li>Base lista para reportes (API) y dashboard.</li>
            </ul>

            {summary?.available && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Stat label="PC escritorio (en uso)" value={(summary.availability?.desktops.inUse ?? 0).toLocaleString('es-PE')} />
                <Stat label="Laptops (en uso)" value={(summary.availability?.laptops.inUse ?? 0).toLocaleString('es-PE')} />
                <Stat label="Tablets (en uso)" value={(summary.availability?.tablets.inUse ?? 0).toLocaleString('es-PE')} />
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-black">Paso 3 — Completar 2 respuestas manuales</h2>
          <p className="mt-2 text-sm text-black/80">
            El PDF no expone cuál checkbox está marcado como texto (se dibuja como gráfico). Por eso, para estas 2 preguntas usamos un selector:
          </p>

          {!summary?.available && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              Importa primero el ENAD (Paso 1) para poder configurar estas preguntas.
            </div>
          )}

          {summary?.available && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-black">10. Nº aproximado de personas (31 dic 2025)</span>
                <select
                  className="rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black"
                  value={sel10}
                  onChange={(e) => setSel10(e.target.value)}
                >
                  <option value="">(Sin definir)</option>
                  {opts10.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-black">11. Teletrabajo / remoto</span>
                <select
                  className="rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black"
                  value={sel11}
                  onChange={(e) => setSel11(e.target.value)}
                >
                  <option value="">(Sin definir)</option>
                  {opts11.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  className="rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-black hover:border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-weak)]"
                  onClick={() => router.push('/dashboard')}
                  disabled={saving}
                >
                  Volver al dashboard
                </button>
                <button
                  className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-extrabold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

