import Constants from "expo-constants";
import { Platform } from "react-native";

const rawApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const expoHostUri =
  Constants.expoConfig?.hostUri ||
  Constants.platform?.hostUri ||
  Constants.linkingUri ||
  Constants.experienceUrl ||
  "";

function parseHost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.includes("://") ? trimmed : `exp://${trimmed}`;
  try {
    return new URL(normalized).hostname || "";
  } catch {
    const match = trimmed.match(/^(?:\w+:\/\/)?([^/:]+)/);
    return match?.[1] || "";
  }
}

function deriveExpoApiBase() {
  const host = parseHost(expoHostUri);
  if (host) {
    return `http://${host}:8000`;
  }
  if (Platform.OS === "web") {
    return "http://localhost:8000";
  }
  return "http://127.0.0.1:8000";
}

function normalizeApiBase() {
  const derived = deriveExpoApiBase();
  if (!rawApiBase) {
    return derived;
  }

  if (
    Platform.OS !== "web" &&
    /localhost|127\.0\.0\.1/i.test(rawApiBase) &&
    parseHost(expoHostUri)
  ) {
    return derived;
  }

  return rawApiBase;
}

export const API_BASE = normalizeApiBase().replace(/\/+$/, "");

let authToken: string | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function resolveAssetUrl(url?: string | null) {
  if (!url) return `${API_BASE}/static/default.png`;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

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
