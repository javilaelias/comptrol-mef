import { API_BASE_URL } from './config';
import { ensureSession, getToken } from './auth';

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

async function doFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  return fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res = await doFetch(path, init, token);

  // Sin sesión previa: entra automáticamente (cuenta fija) y reintenta.
  if (res.status === 401 && !token) {
    const ok = await ensureSession();
    if (ok) res = await doFetch(path, init, getToken());
  }

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message =
      (body && typeof body === 'object' && 'message' in body && (body as Record<string, unknown>).message) ||
      res.statusText ||
      'Request failed';
    const err: ApiError = { status: res.status, message: String(message) };
    throw err;
  }

  return (await res.json()) as T;
}
