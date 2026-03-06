'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { API_BASE_URL } from '@/lib/config';
import { getToken, setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@mef.gob.pe');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'Login failed');

      setToken(body.accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto mt-10 max-w-md overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white shadow-sm">
        <div className="h-2 bg-[color:var(--color-brand)]" />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/70">Ministerio de Economía y Finanzas</p>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-black">Ingresar a Comptrol‑MEF</h1>
          <p className="mt-1 text-sm text-black/80">Login local (demo). Luego se conectará a SSO institucional.</p>

          {getToken() && (
            <div className="mt-4 rounded-2xl border border-[color:var(--color-border)] bg-black/[0.02] px-4 py-3 text-sm text-black/80">
              Ya existe una sesión guardada en este navegador. Si deseas volver a iniciar sesión, puedes presionar “Ingresar” nuevamente o usar “Salir” dentro del
              sistema.
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="text-sm font-semibold text-black">Email</span>
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-black outline-none focus:border-[color:var(--color-brand)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-black">Password</span>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-black outline-none focus:border-[color:var(--color-brand)]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-70"
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

