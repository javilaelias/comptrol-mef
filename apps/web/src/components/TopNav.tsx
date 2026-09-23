'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

/** La página de alertas lo dispara al atender o descartar, para refrescar el contador del menú. */
export const ALERTS_CHANGED_EVENT = 'comptrol:alerts-changed';

export function TopNav({ title }: { title?: string }) {
  const pathname = usePathname();
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      apiFetch<{ open: number }>('/alerts/count')
        .then((c) => alive && setOpenAlerts(c.open))
        .catch(() => undefined); // el contador es accesorio: si falla, el menú sigue igual
    refresh();
    window.addEventListener(ALERTS_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(ALERTS_CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  const navItem = (href: string, label: React.ReactNode) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        key={href}
        href={href}
        className={[
          'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
          active
            ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)] text-white'
            : 'border-[color:var(--color-border)] bg-white text-black hover:border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-weak)]',
        ].join(' ')}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="mb-6 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white shadow-sm">
      <div className="h-2 bg-[color:var(--color-brand)]" />
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/70">Ministerio de Economía y Finanzas</p>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-base font-extrabold tracking-tight text-black">
              Comptrol‑MEF
            </Link>
            {title && <span className="text-sm text-black/50">/</span>}
            {title && <span className="text-sm font-semibold text-black/80">{title}</span>}
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {navItem('/dashboard', 'Dashboard')}
          {navItem('/assets', 'Activos')}
          {navItem('/intangibles', 'Intangibles')}
          {navItem('/licenses', 'Licencias')}
          {navItem(
            '/alerts',
            <>
              Alertas
              {openAlerts ? (
                <span
                  className="ml-1.5 inline-block min-w-[1.25rem] rounded-full bg-amber-400 px-1.5 text-center text-xs font-bold text-black"
                  title={`${openAlerts} alertas abiertas`}
                >
                  {openAlerts > 99 ? '99+' : openAlerts}
                </span>
              ) : null}
            </>,
          )}
          {navItem('/sites', 'Sedes')}
        </nav>
      </div>
    </header>
  );
}
