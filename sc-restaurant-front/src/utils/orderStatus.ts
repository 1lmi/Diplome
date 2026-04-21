const TERMINAL_ORDER_STATUSES = new Set(["done", "canceled", "cancelled"]);

export function normalizeOrderStatus(status?: string | null) {
  return (status || "").trim().toLowerCase();
}

export function isTerminalOrderStatus(status?: string | null) {
  return TERMINAL_ORDER_STATUSES.has(normalizeOrderStatus(status));
}
