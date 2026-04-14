import { resolveAssetUrl } from "@/src/api/client";
import { normalizePhoneValue } from "@/src/lib/phone";

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function normalizePhone(value: string) {
  return normalizePhoneValue(value);
}

export function getDisplayImage(url?: string | null) {
  return resolveAssetUrl(url);
}

export function getFullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim();
}

export function sizeCaption(label?: string | null, amount?: number | null, unit?: string | null) {
  if (label?.trim()) return label.trim();
  if (amount !== null && amount !== undefined) {
    return `${amount}${unit ? ` ${unit}` : ""}`;
  }
  return null;
}
