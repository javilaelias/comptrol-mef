import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from './auth';

export function useRequireAuth() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    ensureSession().then((ok) => {
      if (!cancelled && !ok) router.push('/login');
    });
    return () => {
      cancelled = true;
    };
  }, [router]);
}

