import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from './auth';

export function useRequireAuth() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) router.push('/login');
  }, [router]);
}

