import { API_BASE_URL } from './config';

const TOKEN_KEY = 'comptrol_token';

const AUTO_LOGIN_EMAIL = process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL || 'admin@mef.gob.pe';
const AUTO_LOGIN_PASSWORD = process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD || 'Admin123!';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// Recibe el ticket SSO firmado por gti-app (portal OPDA Apps) y lo canjea por una
// sesión propia de Comptrol-MEF. Usado por /sso, la página receptora del tile del portal.
export async function loginWithTicket(ticket: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.accessToken) return false;
    setToken(body.accessToken);
    return true;
  } catch {
    return false;
  }
}

// La app vive dentro de gti-app (SSO del portal) y no pide login propio.
// Si no hay sesión guardada, entra automáticamente con la cuenta fija.
export async function ensureSession(): Promise<boolean> {
  if (getToken()) return true;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: AUTO_LOGIN_EMAIL, password: AUTO_LOGIN_PASSWORD }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.accessToken) return false;
    setToken(body.accessToken);
    return true;
  } catch {
    return false;
  }
}

