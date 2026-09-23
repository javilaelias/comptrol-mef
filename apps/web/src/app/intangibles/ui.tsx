'use client';

import React from 'react';
import { SUSPICIOUS_ACCOUNT_TEXT } from './types';

export const inputClass = 'rounded-xl border border-slate-300 px-3 py-2 text-sm';
export const buttonClass =
  'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60';
export const primaryButtonClass =
  'rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60';

export function SuspiciousBadge() {
  return (
    <span
      className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
      title={SUSPICIOUS_ACCOUNT_TEXT}
    >
      ¿Cuenta?
    </span>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>;
}

export function Pager({
  total,
  take,
  skip,
  onChange,
}: {
  total: number;
  take: number;
  skip: number;
  onChange: (skip: number) => void;
}) {
  const page = Math.floor(skip / take) + 1;
  const pages = Math.max(1, Math.ceil(total / take));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <button className={buttonClass} disabled={skip === 0} onClick={() => onChange(Math.max(0, skip - take))}>
        Anterior
      </button>
      <span>
        Página <span className="font-medium text-slate-900">{page}</span> de {pages.toLocaleString('es-PE')} ·{' '}
        {total.toLocaleString('es-PE')} filas
      </span>
      <button className={buttonClass} disabled={skip + take >= total} onClick={() => onChange(skip + take)}>
        Siguiente
      </button>
    </div>
  );
}
