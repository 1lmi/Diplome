import type { Order, OrderHistoryItem } from "@/src/api/types";

export type ProgressTone = "completed" | "current" | "future" | "danger";

export interface OrderProgressStep {
  key: string;
  label: string;
  caption: string;
  tone: ProgressTone;
}

const DELIVERY_FLOW = ["new", "cooking", "ready", "on_way", "done"];
const PICKUP_FLOW = ["new", "cooking", "ready", "done"];
const CANCELED_CODES = new Set(["canceled", "cancelled"]);
const TERMINAL_STATUSES = new Set(["done", "canceled", "cancelled"]);

const LABELS: Record<string, { label: string; caption: string }> = {
  new: { label: "Новый", caption: "Заказ принят и ждёт приготовления" },
  cooking: { label: "Готовим", caption: "Кухня уже собирает ваш заказ" },
  ready: { label: "Готов", caption: "Заказ почти у вас" },
  on_way: { label: "В пути", caption: "Курьер уже едет" },
  done: { label: "Завершён", caption: "Заказ успешно выдан" },
  canceled: { label: "Отменён", caption: "Заказ закрыт без выдачи" },
};

function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase();
}

export function isTerminalOrderStatus(status?: string | null) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

export function buildOrderProgress(order: Order): OrderProgressStep[] {
  const current = normalizeStatus(order.status);
  const baseFlow = order.delivery_method === "pickup" ? PICKUP_FLOW : DELIVERY_FLOW;
  const flowIndex = baseFlow.indexOf(current);

  if (CANCELED_CODES.has(current)) {
    return [
      ...baseFlow.slice(0, Math.max(1, flowIndex > -1 ? flowIndex : 1)).map((code, index) => ({
        key: code,
        label: LABELS[code]?.label || code,
        caption: LABELS[code]?.caption || "",
        tone: (index === 0 ? "completed" : "future") as ProgressTone,
      })),
      {
        key: "canceled",
        label: LABELS.canceled.label,
        caption: LABELS.canceled.caption,
        tone: "danger" as ProgressTone,
      },
    ];
  }

  return baseFlow.map((code, index) => {
    const tone: ProgressTone =
      flowIndex === -1
        ? index === 0
          ? "current"
          : "future"
        : index < flowIndex
          ? "completed"
          : index === flowIndex
            ? "current"
            : "future";

    const label =
      code === "done" && order.delivery_method === "pickup"
        ? "Выдан"
        : LABELS[code]?.label || code;

    return {
      key: code,
      label,
      caption: LABELS[code]?.caption || "",
      tone,
    };
  });
}

export function getActiveHistoryEntry(order: Order): OrderHistoryItem | null {
  if (!order.history?.length) return null;
  return order.history[order.history.length - 1] || null;
}
