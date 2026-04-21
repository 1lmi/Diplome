import type { AdminOrder } from "../../types";

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

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
