'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect } from 'react';
import { loginWithTicket } from '@/lib/auth';

function SsoReceiver() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ticket = searchParams.get('ticket');
    if (!ticket) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    loginWithTicket(ticket).then((ok) => {
      if (cancelled) return;
      router.replace(ok ? '/' : '/login');
    });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <p className="text-sm text-black/70">Validando sesión…</p>
    </main>
  );
}

export default function SsoPage() {
  return (
    <Suspense fallback={null}>
      <SsoReceiver />
    </Suspense>
  );
}
