'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '@/lib/api';
import { formatDate, formatMoney, type ReconciliationSummary, type ViewResponse } from './types';
import { buttonClass, inputClass, Pager, SuspiciousBadge } from './ui';

const TAKE = 50;

type Row = Record<string, unknown>;
type Column = { label: string; render: (r: Row) => React.ReactNode; className?: string };

const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const code = (r: Row) => (
  <>
    {str(r.code)}
    {r.suspicious_account === true && <SuspiciousBadge />}
  </>
);

type ViewDef = {
  key: 'only-siga' | 'only-excel' | 'field-diffs' | 'po-counts' | 'pending' | 'expiry';
  label: string;
  help: string;
  count: (s: ReconciliationSummary['counts']) => number;
  detail?: (s: ReconciliationSummary['counts']) => string;
  subsets?: Array<{ value: string; label: string }>;
  suspiciousFilter?: boolean;
  onlyDiff?: boolean;
  columns: Column[];
};

const VIEWS: ViewDef[] = [
  {
    key: 'only-siga',
    label: 'Solo en SIGA',
    help: 'Bienes que SIGA registra y el Excel del coordinador no tiene. Los vigentes son la señal; las bajas son informativas.',
    count: (c) => c.onlySiga.active + c.onlySiga.retired,
    detail: (c) => `${c.onlySiga.active.toLocaleString('es-PE')} vigentes · ${c.onlySiga.retired.toLocaleString('es-PE')} de baja`,
    subsets: [
      { value: 'active', label: 'Vigentes' },
      { value: 'retired', label: 'De baja' },
    ],
    columns: [
      { label: 'Código', render: code },
      { label: 'Estado', render: (r) => (r.status === 'retired' ? 'De baja' : 'Vigente') },
      { label: 'Descripción', render: (r) => str(r.description), className: 'min-w-[18rem]' },
      { label: 'OC', render: (r) => (r.po_number ? `${str(r.po_number)}-${str(r.po_year)}` : '—') },
      { label: 'Proveedor', render: (r) => str(r.supplier) },
      { label: 'Alta', render: (r) => formatDate(r.registered_at as string) },
      { label: 'Valor inicial', render: (r) => formatMoney(r.initial_value as number) },
    ],
  },
  {
    key: 'only-excel',
    label: 'Solo en Excel',
    help: 'Códigos del Excel que no existen en el corte de SIGA vigente.',
    count: (c) => c.onlyExcel,
    suspiciousFilter: true,
    columns: [
      { label: 'Código', render: code },
      { label: 'Descripción', render: (r) => str(r.description), className: 'min-w-[18rem]' },
      { label: 'OC', render: (r) => str(r.po_number) },
      { label: 'Proveedor', render: (r) => str(r.supplier) },
      { label: 'Alta', render: (r) => formatDate(r.registered_at as string) },
      { label: 'Condición', render: (r) => str(r.condition) },
      { label: 'Vencimiento', render: (r) => formatDate(r.expires_at as string) },
    ],
  },
  {
    key: 'field-diffs',
    label: 'Campos distintos',
    help: 'Bienes presentes en ambos lados con descripción, código de inventario, OC, fecha de alta o valor distintos. SIGA es la referencia. El proveedor no se compara porque la razón social se escribe distinto en cada fuente.',
    count: (c) => c.fieldDiffs,
    suspiciousFilter: true,
    columns: [
      { label: 'Código', render: code },
      { label: 'Descripción (SIGA)', render: (r) => str(r.description), className: 'min-w-[16rem]' },
      { label: 'Campo', render: (r) => <span className="font-medium">{str(r.field)}</span> },
      { label: 'En SIGA', render: (r) => str(r.siga_value) },
      { label: 'En el Excel', render: (r) => str(r.excel_value) },
    ],
  },
  {
    key: 'po-counts',
    label: 'Cantidades por OC',
    help: 'Bienes vigentes por N° de OC y año de alta en cada fuente.',
    count: (c) => c.poCountsWithDifference,
    onlyDiff: true,
    columns: [
      { label: 'N° OC', render: (r) => str(r.po_number) },
      { label: 'Año', render: (r) => str(r.po_year) },
      { label: 'En SIGA', render: (r) => str(r.siga_count), className: 'text-right' },
      { label: 'En el Excel', render: (r) => str(r.excel_count), className: 'text-right' },
      {
        label: 'Diferencia',
        render: (r) => (
          <span className={Number(r.difference) !== 0 ? 'font-semibold text-rose-700' : ''}>{str(r.difference)}</span>
        ),
        className: 'text-right',
      },
      { label: 'Ejemplo de bien', render: (r) => str(r.sample_description), className: 'min-w-[16rem]' },
    ],
  },
  {
    key: 'pending',
    label: 'Pendientes del coordinador',
    help: 'Bienes vigentes a los que les falta la condición, o que tienen vida útil definida sin fecha de vencimiento. Exporta esta vista para devolvérsela al coordinador.',
    count: (c) => c.pending.noCondition + c.pending.definedNoExpiry,
    detail: (c) => `${c.pending.noCondition.toLocaleString('es-PE')} sin condición · ${c.pending.definedNoExpiry.toLocaleString('es-PE')} sin vencimiento`,
    subsets: [
      { value: 'no_condition', label: 'Sin condición' },
      { value: 'defined_no_expiry', label: 'Definida sin vencimiento' },
    ],
    suspiciousFilter: true,
    columns: [
      { label: 'Código', render: code },
      { label: 'Descripción', render: (r) => str(r.description), className: 'min-w-[18rem]' },
      {
        label: 'Motivo',
        render: (r) => (r.reason === 'no_condition' ? 'Sin condición' : 'Vida útil definida sin vencimiento'),
      },
      { label: 'OC', render: (r) => str(r.po_number) },
      { label: 'Fila del Excel', render: (r) => str(r.row_number) },
    ],
  },
  {
    key: 'expiry',
    label: 'Vencimientos',
    help: 'Bienes vigentes con fecha de vencimiento en el Excel.',
    count: (c) => c.expiry.expired + c.expiry.expiring + c.expiry.valid,
    detail: (c) => `${c.expiry.expired.toLocaleString('es-PE')} vencidos · ${c.expiry.expiring.toLocaleString('es-PE')} por vencer`,
    subsets: [
      { value: 'expired', label: 'Vencidos' },
      { value: 'expiring', label: 'Por vencer' },
      { value: 'valid', label: 'Vigentes' },
    ],
    suspiciousFilter: true,
    columns: [
      { label: 'Código', render: code },
      { label: 'Descripción', render: (r) => str(r.description), className: 'min-w-[18rem]' },
      { label: 'Condición', render: (r) => str(r.condition) },
      { label: 'Vence', render: (r) => formatDate(r.expires_at as string) },
      {
        label: 'Situación',
        render: (r) =>
          r.bucket === 'expired' ? (
            <span className="text-rose-700">Vencido</span>
          ) : r.bucket === 'expiring' ? (
            <span className="text-amber-800">Por vencer</span>
          ) : (
            'Vigente'
          ),
      },
      { label: 'OC', render: (r) => str(r.po_number) },
      { label: 'Proveedor', render: (r) => str(r.supplier) },
    ],
  },
];

function subsetCount(view: ViewDef['key'], subset: string, c: ReconciliationSummary['counts']): number | null {
  const map: Record<string, number> = {
    'only-siga:active': c.onlySiga.active,
    'only-siga:retired': c.onlySiga.retired,
    'pending:no_condition': c.pending.noCondition,
    'pending:defined_no_expiry': c.pending.definedNoExpiry,
    'expiry:expired': c.expiry.expired,
    'expiry:expiring': c.expiry.expiring,
    'expiry:valid': c.expiry.valid,
  };
  return map[`${view}:${subset}`] ?? null;
}

export function ReconciliationTab({
  summary,
  onError,
}: {
  summary: ReconciliationSummary | null;
  onError: (err: unknown) => void;
}) {
  const [viewKey, setViewKey] = useState<ViewDef['key']>('pending');
  const [subset, setSubset] = useState('');
  const [suspicious, setSuspicious] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ViewResponse | null>(null);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const view = VIEWS.find((v) => v.key === viewKey)!;

  const query = useCallback(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set('search', search.trim());
    if (subset) q.set('subset', subset);
    if (suspicious && view.suspiciousFilter) q.set('suspicious', '1');
    if (onlyDiff && view.onlyDiff) q.set('onlyDiff', '1');
    return q;
  }, [search, subset, suspicious, onlyDiff, view]);

  const load = useCallback(
    async (nextSkip: number) => {
      setLoading(true);
      try {
        const q = query();
        q.set('take', String(TAKE));
        q.set('skip', String(nextSkip));
        setData(await apiFetch<ViewResponse>(`/intangibles/reconciliation/${viewKey}?${q.toString()}`));
        setSkip(nextSkip);
      } catch (err) {
        onError(err);
      } finally {
        setLoading(false);
      }
    },
    [query, viewKey, onError],
  );

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, subset, suspicious, onlyDiff]);

  async function exportView() {
    setExporting(true);
    try {
      await apiDownload(`/intangibles/reconciliation/${viewKey}/export?${query().toString()}`, `intangibles-${viewKey}.xlsx`);
    } catch (err) {
      onError(err);
    } finally {
      setExporting(false);
    }
  }

  const counts = summary?.counts;

  return (
    <div className="mt-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => {
              setViewKey(v.key);
              setSubset('');
              setData(null);
            }}
            className={[
              'rounded-xl border p-3 text-left',
              v.key === viewKey ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-weak)]' : 'border-slate-200 bg-white hover:bg-slate-50',
            ].join(' ')}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{v.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{counts ? v.count(counts).toLocaleString('es-PE') : '…'}</p>
            {counts && v.detail && <p className="mt-1 text-xs text-slate-600">{v.detail(counts)}</p>}
          </button>
        ))}
      </div>

      {counts && counts.suspiciousAccount > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          <SuspiciousBadge /> {counts.suspiciousAccount.toLocaleString('es-PE')} bienes del Excel están en la cuenta
          &quot;MUEBLES Y ENSERES NO DEPRECIABLE&quot; (posible error de cuenta).
        </p>
      )}

      <p className="mt-4 text-sm text-slate-600">{view.help}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {view.subsets && (
          <select className={inputClass} value={subset} onChange={(e) => setSubset(e.target.value)}>
            <option value="">Todos</option>
            {view.subsets.map((s) => {
              const n = counts ? subsetCount(view.key, s.value, counts) : null;
              return (
                <option key={s.value} value={s.value}>
                  {s.label}
                  {n !== null ? ` (${n.toLocaleString('es-PE')})` : ''}
                </option>
              );
            })}
          </select>
        )}
        {view.suspiciousFilter && (
          <label className="flex items-center gap-1 text-sm text-slate-700">
            <input type="checkbox" checked={suspicious} onChange={(e) => setSuspicious(e.target.checked)} />
            Solo cuenta dudosa
          </label>
        )}
        {view.onlyDiff && (
          <label className="flex items-center gap-1 text-sm text-slate-700">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            Solo OC con diferencia
          </label>
        )}
        <input
          className={`${inputClass} min-w-[16rem] flex-1`}
          placeholder={view.key === 'po-counts' ? 'N° de OC o descripción…' : 'Código o descripción…'}
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
          Sin resultados: no hay diferencias en esta vista con los filtros actuales.
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr className="border-b">
                  {view.columns.map((c) => (
                    <th key={c.label} className={`whitespace-nowrap py-2 pr-3 font-medium ${c.className ?? ''}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((r, i) => (
                  <tr key={`${String(r.code ?? r.po_number)}-${String(r.field ?? r.po_year ?? '')}-${i}`} className="border-b last:border-0">
                    {view.columns.map((c) => (
                      <td key={c.label} className={`py-2 pr-3 text-slate-700 ${c.className ?? 'whitespace-nowrap'}`}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} take={TAKE} skip={skip} onChange={load} />
        </>
      )}
    </div>
  );
}
