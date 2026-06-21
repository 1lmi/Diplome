import type { AdminOrder } from "../../types";

export const BUSINESS_TIME_ZONE = "Asia/Yekaterinburg";

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

const getBusinessDateParts = (date: Date) => {
  const parts = Object.fromEntries(
    businessDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour),
  };
};

export const terminalStatuses = new Set([
  "done",
  "delivered",
  "cancelled",
  "canceled",
  "completed",
  "finished",
]);

export type CurrentOrderLane = "new" | "cooking" | "ready" | "on_way";
export type DeliveryKind = "delivery" | "pickup";

const statusLabels: Record<string, string> = {
  new: "Новый",
  cooking: "Готовится",
  ready: "Готов",
  on_way: "В пути",
  done: "Завершён",
  canceled: "Отменён",
};

export const isTerminalStatus = (status: string) => terminalStatuses.has(status.toLowerCase());

export const dayKey = (date: Date) => {
  const { year, month, day } = getBusinessDateParts(date);
  return `${year}-${month}-${day}`;
};

export const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

export const businessHour = (date: Date) => getBusinessDateParts(date).hour;

export const businessWeekday = (date: Date) =>
  new Date(`${dayKey(date)}T00:00:00Z`).getUTCDay();

export const shiftBusinessDayKey = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const formatBusinessDayKey = (key: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${key}T00:00:00Z`));

export const startOfBusinessDay = (date = new Date()) =>
  new Date(`${dayKey(date)}T00:00:00+05:00`);

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

export const getEffectiveDeliveryKind = (
  order: Pick<AdminOrder, "delivery_method" | "customer_address">
): DeliveryKind => {
  const method = (order.delivery_method || "").trim().toLowerCase();
  if (method === "delivery" || method === "pickup") {
    return method;
  }
  return (order.customer_address || "").trim() ? "delivery" : "pickup";
};

export const getCurrentLane = (status: string): CurrentOrderLane | null => {
  const normalized = status.toLowerCase();
  if (
    normalized === "new" ||
    normalized === "cooking" ||
    normalized === "ready" ||
    normalized === "on_way"
  ) {
    return normalized;
  }
  return null;
};

export const getNextStatus = (
  order: Pick<AdminOrder, "status" | "delivery_method" | "customer_address">
): string | null => {
  const normalized = order.status.toLowerCase();
  if (normalized === "new") return "cooking";
  if (normalized === "cooking") return "ready";
  if (normalized === "ready") {
    return getEffectiveDeliveryKind(order) === "delivery" ? null : "done";
  }
  if (normalized === "on_way") return "done";
  return null;
};

export const getNextActionLabel = (
  order: Pick<AdminOrder, "status" | "delivery_method" | "customer_address">
): string | null => {
  const nextStatus = getNextStatus(order);
  return nextStatus ? getStatusDisplayName(nextStatus) : null;
};

export const getStatusDisplayName = (status: string) =>
  statusLabels[status.toLowerCase()] ?? status;

export const canCancel = (order: Pick<AdminOrder, "status">) => !isTerminalStatus(order.status);
