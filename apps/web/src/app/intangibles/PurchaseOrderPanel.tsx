'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatDate } from './types';

type PurchaseOrder = {
  kind: 'OC' | 'OS';
  year: number;
  number: number;
  date: string | null;
  contract: string | null;
  contractDate: string | null;
  reference: string | null;
  currency: string | null;
  exchangeRate: number | null;
  subject: string | null;
  summary: string | null;
  paymentTerms: string | null;
  warranty: string | null;
  deliveryDays: number | null;
  supplier: { name: string | null; ruc: string | null };
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  totalSoles: number | null;
  items: Array<{
    n: number;
    catalogCode: string;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    total: number | null;
    warrantyDays: number | null;
    specs: string | null;
  }>;
};

type Detail = { siga: { poDetail: PurchaseOrder | null } | null };

const KIND_LABEL = { OC: 'Orden de compra', OS: 'Orden de servicio' } as const;

function money(value: number | null, currency: string | null): string {
  if (value === null) return '—';
  const symbol = !currency || currency.startsWith('S/') ? 'S/' : currency;
  return `${symbol} ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * Orden de SIGA de un bien intangible, reconstruida con los datos del corte (SIGA no guarda el
 * documento firmado). Solo existe para órdenes verificadas por ítem de catálogo.
 */
export function PurchaseOrderPanel({
  code,
  poStatus,
  poNumber,
  entryDate,
  onError,
}: {
  code: string;
  poStatus: string;
  poNumber: unknown;
  entryDate: string | null;
  onError: (err: unknown) => void;
}) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(poStatus === 'verified');

  useEffect(() => {
    if (poStatus !== 'verified') return;
    let alive = true;
    apiFetch<Detail>(`/intangibles/${encodeURIComponent(code)}`)
      .then((d) => alive && setOrder(d.siga?.poDetail ?? null))
      .catch(onError)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code, poStatus, onError]);

  if (poStatus === 'unverified') {
    return (
      <p className="text-amber-900">
        SIGA registra la orden N° {String(poNumber)} para este bien, pero la orden con ese número (del año de compra o el
        anterior) es de otra cosa. No se muestra para no confundir: hay que ubicar la orden correcta a mano.
        {entryDate && <> La ficha del bien en SIGA registra como fecha de compra el {formatDate(entryDate)}.</>}
      </p>
    );
  }
  if (poStatus === 'no_order') {
    return (
      <p className="text-slate-600">
        Este bien ingresó por Nota de Entrada de Almacén (NEA)
        {entryDate && <> el {formatDate(entryDate)}</>}: SIGA no le asocia una orden.
      </p>
    );
  }
  if (loading) return <p className="text-slate-600">Cargando la orden…</p>;
  if (!order) return <p className="text-slate-600">La orden no está disponible en este corte de SIGA.</p>;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          {KIND_LABEL[order.kind]} N° {order.number}-{order.year}
        </h3>
        <span className="text-xs text-slate-500">Reconstruida desde SIGA (no es el documento firmado)</span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Fecha de la orden" value={formatDate(order.date)} />
        <Field label="Fecha de compra (ficha del bien)" value={entryDate ? formatDate(entryDate) : null} />
        <Field
          label="Proveedor"
          value={
            order.supplier.name && (
              <>
                {order.supplier.name}
                {order.supplier.ruc && <span className="text-slate-500"> · RUC {order.supplier.ruc}</span>}
              </>
            )
          }
        />
        <Field
          label="Contrato"
          value={order.contract && `${order.contract}${order.contractDate ? ` (${formatDate(order.contractDate)})` : ''}`}
        />
        <Field label="Documento de referencia" value={order.reference} />
        <Field label="Condición de pago" value={order.paymentTerms} />
        <Field label="Garantía" value={order.warranty} />
        <Field label="Plazo de entrega" value={order.deliveryDays ? `${order.deliveryDays} días` : null} />
        <Field
          label="Moneda"
          value={order.currency && order.exchangeRate && order.exchangeRate !== 1 ? `${order.currency} (T.C. ${order.exchangeRate})` : null}
        />
      </dl>
      <Field label="Concepto" value={order.subject} />
      {order.summary && <p className="mt-1 text-slate-700">{order.summary}</p>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-600">
            <tr className="border-b">
              {['#', 'Catálogo', 'Descripción', 'Cantidad', 'Unidad', 'P. unitario', 'Total'].map((h) => (
                <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={`${i.n}-${i.catalogCode}`} className="border-b align-top last:border-0">
                <td className="py-1 pr-3">{i.n}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-slate-600">{i.catalogCode}</td>
                <td className="min-w-[16rem] py-1 pr-3">
                  {i.description ?? '—'}
                  {i.warrantyDays && <span className="block text-xs text-slate-500">Garantía: {i.warrantyDays} días</span>}
                  {i.specs && (
                    <details className="mt-1 text-xs text-slate-600">
                      <summary className="cursor-pointer">Especificaciones</summary>
                      <p className="whitespace-pre-line">{i.specs}</p>
                    </details>
                  )}
                </td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">{i.quantity?.toLocaleString('es-PE') ?? '—'}</td>
                <td className="whitespace-nowrap py-1 pr-3">{i.unit ?? '—'}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">{money(i.unitPrice, order.currency)}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">{money(i.total, order.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {[
              ['Subtotal', order.subtotal],
              ['IGV', order.tax],
              ['Total', order.total],
            ].map(([label, value]) => (
              <tr key={label as string}>
                <td colSpan={6} className="py-1 pr-3 text-right text-slate-600">
                  {label}
                </td>
                <td className={`whitespace-nowrap py-1 pr-3 text-right ${label === 'Total' ? 'font-semibold text-slate-900' : ''}`}>
                  {money(value as number | null, order.currency)}
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
