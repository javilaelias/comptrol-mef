'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '@/lib/api';
import { formatDate, type ReconciliationSummary, type ViewResponse } from './types';
import { buttonClass, inputClass, Pager, SuspiciousBadge } from './ui';

const TAKE = 50;
const VIEW = 'no-condition-siga';

const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

const STATUS: Record<string, { label: string; className: string }> = {
  verified: { label: 'Verificada', className: 'text-emerald-700' },
  unverified: { label: 'No verificada', className: 'text-amber-800' },
  no_order: { label: 'Sin orden (NEA)', className: 'text-slate-600' },
};

const HEADERS = [
  'Código',
  'Descripción',
  'Fin de vida útil (SIGA)',
  'Orden',
  'Fecha orden',
  'Objeto de la orden',
  'Situación',
  'Proveedor',
  'Fila Excel',
];

/**
 * Bienes vigentes que el Excel del coordinador tiene sin condición, con lo que SIGA sabe de ellos:
 * fin de vida útil contable y la orden de compra o servicio.
 */
export function NoConditionSigaTab({
  summary,
  onError,
}: {
  summary: ReconciliationSummary | null;
  onError: (err: unknown) => void;
}) {
  const [subset, setSubset] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ViewResponse | null>(null);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const counts = summary?.counts.noConditionSiga;

  const query = useCallback(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set('search', search.trim());
    if (subset) q.set('subset', subset);
    return q;
  }, [search, subset]);

  const load = useCallback(
    async (nextSkip: number) => {
      setLoading(true);
      try {
        const q = query();
        q.set('take', String(TAKE));
        q.set('skip', String(nextSkip));
        setData(await apiFetch<ViewResponse>(`/intangibles/reconciliation/${VIEW}?${q.toString()}`));
        setSkip(nextSkip);
      } catch (err) {
        onError(err);
      } finally {
        setLoading(false);
      }
    },
    [query, onError],
  );

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subset]);

  async function exportView() {
    setExporting(true);
    try {
      await apiDownload(`/intangibles/reconciliation/${VIEW}/export?${query().toString()}`, `intangibles-${VIEW}.xlsx`);
    } catch (err) {
      onError(err);
    } finally {
      setExporting(false);
    }
  }

  const total = counts ? counts.verified + counts.unverified + counts.noOrder : null;
  const options = [
    { value: 'verified', label: 'Orden verificada', n: counts?.verified },
    { value: 'unverified', label: 'Orden no verificada', n: counts?.unverified },
    { value: 'no_order', label: 'Sin orden (ingreso por NEA)', n: counts?.noOrder },
  ];

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">
        Bienes vigentes que el Excel del coordinador tiene <strong>sin condición</strong>
        {total !== null && <> ({total.toLocaleString('es-PE')})</>}, con los datos de SIGA para completarlos.
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
        <li>
          <strong>Fin de vida útil (SIGA)</strong>: fecha contable (alta + años de vida útil), no la del vencimiento de la
          licencia.
          {counts && <> SIGA la tiene en {counts.withEndOfLife.toLocaleString('es-PE')} bienes.</>}
        </li>
        <li>
          <strong>Orden verificada</strong>: la orden de SIGA contiene este mismo bien. <strong>No verificada</strong>: SIGA
          registra un N° de orden, pero la orden con ese número es de otra cosa; hay que revisarla a mano.
        </li>
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={inputClass} value={subset} onChange={(e) => setSubset(e.target.value)}>
          <option value="">Todos</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.n !== undefined ? ` (${o.n.toLocaleString('es-PE')})` : ''}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} min-w-[16rem] flex-1`}
          placeholder="Código o descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(0)}
        />
        <button className={buttonClass} onClick={() => load(0)}>
          Buscar
        </button>
        <button className={buttonClass} onClick={exportView} disabled={exporting || !data?.total}>
          {exporting ? 'Exportando…' : 'Exportar a Excel'}
        </button>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

      {data && !loading && data.total === 0 && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Sin resultados con los filtros actuales.
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr className="border-b">
                  {HEADERS.map((h) => (
                    <th key={h} className="whitespace-nowrap py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const st = STATUS[String(r.po_status)];
                  return (
                    <tr key={String(r.code)} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">
                        {str(r.code)}
                        {r.suspicious_account === true && <SuspiciousBadge />}
                      </td>
                      <td className="min-w-[16rem] py-2 pr-3 text-slate-700">{str(r.description)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{formatDate(r.end_of_life_at as string)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700" title={str(r.entry_doc)}>
                        {r.po_number ? `${r.po_kind ? String(r.po_kind) : 'N°'} ${String(r.po_number)}` : '—'}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{formatDate(r.po_date as string)}</td>
                      <td className="min-w-[16rem] py-2 pr-3 text-slate-700">{str(r.po_subject)}</td>
                      <td className={`whitespace-nowrap py-2 pr-3 ${st?.className ?? ''}`}>{st?.label ?? '—'}</td>
                      <td className="min-w-[12rem] py-2 pr-3 text-slate-700">{str(r.supplier)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{str(r.row_number)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} take={TAKE} skip={skip} onChange={load} />
        </>
      )}
    </div>
  );
}
