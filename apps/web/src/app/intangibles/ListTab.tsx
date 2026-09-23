'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatDate, formatMoney, type IntangibleItem, type IntangibleListResponse } from './types';
import { buttonClass, inputClass, Pager, SuspiciousBadge } from './ui';

const TAKE = 50;

const EXPIRY_LABEL: Record<IntangibleItem['expiry_bucket'], { text: string; className: string }> = {
  expired: { text: 'Vencido', className: 'bg-rose-100 text-rose-800' },
  expiring: { text: 'Por vencer', className: 'bg-amber-100 text-amber-900' },
  valid: { text: 'Vigente', className: 'bg-emerald-100 text-emerald-800' },
  none: { text: '', className: '' },
};

export function ListTab({ onError }: { onError: (err: unknown) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [condition, setCondition] = useState('');
  const [expiry, setExpiry] = useState('');
  const [suspicious, setSuspicious] = useState(false);
  const [data, setData] = useState<IntangibleListResponse | null>(null);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (nextSkip: number) => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ take: String(TAKE), skip: String(nextSkip) });
        if (search.trim()) q.set('search', search.trim());
        if (status) q.set('status', status);
        if (condition) q.set('condition', condition);
        if (expiry) q.set('expiry', expiry);
        if (suspicious) q.set('suspicious', '1');
        setData(await apiFetch<IntangibleListResponse>(`/intangibles?${q.toString()}`));
        setSkip(nextSkip);
      } catch (err) {
        onError(err);
      } finally {
        setLoading(false);
      }
    },
    [search, status, condition, expiry, suspicious, onError],
  );

  useEffect(() => {
    load(0);
    // Los filtros de selección recargan al cambiar; la búsqueda, con Enter o el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, condition, expiry, suspicious]);

  return (
    <div className="mt-4">
      <div className="grid gap-2 md:grid-cols-6">
        <input
          className={`${inputClass} md:col-span-2`}
          placeholder="Código, descripción, proveedor o N° de OC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(0)}
        />
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Estado: todos</option>
          <option value="active">Vigentes en SIGA</option>
          <option value="retired">De baja en SIGA</option>
          <option value="excel_only">Solo en el Excel</option>
        </select>
        <select className={inputClass} value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">Condición: todas</option>
          <option value="definida">Vida útil definida</option>
          <option value="indefinida">Vida útil indefinida</option>
          <option value="none">Sin condición</option>
        </select>
        <select className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
          <option value="">Vencimiento: todos</option>
          <option value="expired">Vencidos</option>
          <option value="expiring">Por vencer ({data?.expiringDays ?? 90} días)</option>
          <option value="valid">Vigentes</option>
          <option value="none">Sin fecha</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-slate-700" title="Cuenta contable MUEBLES Y ENSERES NO DEPRECIABLE">
            <input type="checkbox" checked={suspicious} onChange={(e) => setSuspicious(e.target.checked)} />
            Cuenta dudosa
          </label>
          <button className={buttonClass} onClick={() => load(0)}>
            Buscar
          </button>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

      {data && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr className="border-b">
                  {['Código', 'Descripción', 'Estado SIGA', 'OC', 'Proveedor', 'Alta', 'Valor inicial', 'Condición', 'Vencimiento'].map(
                    (h) => (
                      <th key={h} className="whitespace-nowrap py-2 pr-3 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <React.Fragment key={r.code}>
                    <tr
                      className="cursor-pointer border-b hover:bg-slate-50"
                      onClick={() => setOpen(open === r.code ? null : r.code)}
                    >
                      <td className="whitespace-nowrap py-2 pr-3 font-medium text-slate-900">
                        {r.code}
                        {r.suspicious_account && <SuspiciousBadge />}
                      </td>
                      <td className="min-w-[18rem] py-2 pr-3 text-slate-700">{r.description ?? '—'}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {!r.in_siga ? (
                          <span className="text-amber-800">No está en SIGA</span>
                        ) : r.status === 'retired' ? (
                          <span className="text-slate-500">De baja</span>
                        ) : (
                          'Vigente'
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {r.po_number ? `${r.po_number}${r.po_year ? `-${r.po_year}` : ''}` : '—'}
                      </td>
                      <td className="max-w-[16rem] truncate py-2 pr-3" title={r.siga_supplier ?? r.excel_supplier ?? ''}>
                        {r.siga_supplier ?? r.excel_supplier ?? '—'}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatDate(r.registered_at)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right">{formatMoney(r.initial_value)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {r.condition ?? (r.in_excel ? <span className="text-amber-800">Sin condición</span> : <span className="text-slate-400">Sin datos del coordinador</span>)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {r.expires_at ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EXPIRY_LABEL[r.expiry_bucket].className}`}>
                            {formatDate(r.expires_at)} · {EXPIRY_LABEL[r.expiry_bucket].text}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {open === r.code && (
                      <tr className="border-b bg-slate-50">
                        <td colSpan={9} className="px-3 py-3 text-sm text-slate-700">
                          <dl className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                            <Detail label="Código de inventario" value={r.inventory_code} />
                            <Detail label="Marca" value={r.brand} />
                            <Detail label="Dependencia" value={r.org_unit} />
                            <Detail label="Cuenta contable (Excel)" value={r.account_name} />
                            <Detail label="Proveedor en SIGA" value={r.siga_supplier} />
                            <Detail label="Proveedor en el Excel" value={r.excel_supplier} />
                            <Detail label="HR" value={r.hr} />
                            <Detail label="Documento" value={r.document} />
                            <div className="md:col-span-2">
                              <Detail label="Justificación" value={r.justification} />
                            </div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className="text-slate-900">{value || '—'}</dd>
    </div>
  );
}
