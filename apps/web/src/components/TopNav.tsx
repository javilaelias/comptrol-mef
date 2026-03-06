'use client';

import Link from 'next/link';
import React from 'react';
import { clearToken } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';

export function TopNav({ title }: { title?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const navItem = (href: string, label: string) => {
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
          {navItem('/applications', 'Apps')}
          {navItem('/sites', 'Sedes')}
          {navItem('/enad', 'ENAD')}
          <button
            className="rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-black hover:border-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-weak)]"
            onClick={() => {
              clearToken();
              router.push('/login');
            }}
          >
            Salir
          </button>
        </nav>
      </div>
    </header>
  );
}
