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
      // Con FormData el navegador arma el Content-Type multipart (con su boundary).
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function request(path: string, init: RequestInit): Promise<Response> {
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
  return res;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  return (await res.json()) as T;
}

/** Descarga un archivo de la API (con el token de la sesión) y lo guarda con el nombre que indica el servidor. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await request(path, { method: 'GET' });
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
