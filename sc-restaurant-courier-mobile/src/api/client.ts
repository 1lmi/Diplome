const DEFAULT_REMOTE_API_BASE = 'https://sc-delivery.ru/api';
const rawApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

function normalizeApiBase(value: string) {
  return value.replace(/\/+$/, '');
}

function resolveApiBase() {
  if (!rawApiBase) {
    return DEFAULT_REMOTE_API_BASE;
  }
  return rawApiBase;
}

export const API_BASE = normalizeApiBase(resolveApiBase());

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' && payload && 'detail' in payload
          ? String((payload as { detail?: unknown }).detail || '')
          : '';
    const error = new Error(detail || `API error ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return payload as T;
}
