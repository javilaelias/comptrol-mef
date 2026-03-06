import { API_BASE_URL } from './config';
import { getToken } from './auth';

type ApiError = {
  status: number;
  message: string;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message =
      (body && typeof body === 'object' && 'message' in body && (body as any).message) ||
      res.statusText ||
      'Request failed';
    const err: ApiError = { status: res.status, message: String(message) };
    throw err;
  }

  return (await res.json()) as T;
}

