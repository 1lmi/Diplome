const DEFAULT_REMOTE_API_BASE = "https://sc-delivery.ru/api";
const rawApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

function normalizeApiBase(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveApiBase() {
  if (!rawApiBase) {
    return DEFAULT_REMOTE_API_BASE;
  }

  return rawApiBase;
}

export const API_BASE = normalizeApiBase(resolveApiBase());
export const PUBLIC_BASE = API_BASE.replace(/\/api$/i, "");

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function resolveAssetUrl(url?: string | null) {
  if (!url) return `${PUBLIC_BASE}/static/default.png`;
  if (/^https?:\/\//i.test(url)) return url;
  return `${PUBLIC_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: unknown }).msg || "");
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }

  return fallback;
}

function isNetworkRequestError(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|fetch failed|networkerror/i.test(message);
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (isNetworkRequestError(error)) {
      throw new Error(
        `Не удалось подключиться к ${API_BASE}. Проверьте интернет, доступность сервера и настройки API.`
      );
    }
    throw error;
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      extractErrorMessage(payload, `API error ${response.status}`)
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return payload as T;
}
