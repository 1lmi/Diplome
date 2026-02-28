const STORAGE_KEY = "meatpoint_latest_order_tracking";

interface StoredTracking {
  orderId: number;
  phone: string;
}

export function saveOrderTracking(orderId: number, phone: string) {
  if (typeof window === "undefined") return;
  const normalizedPhone = phone.trim();
  if (!normalizedPhone) return;

  const payload: StoredTracking = {
    orderId,
    phone: normalizedPhone,
  };

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getOrderTracking(orderId?: number): StoredTracking | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredTracking>;
    if (typeof parsed.orderId !== "number" || typeof parsed.phone !== "string") {
      return null;
    }
    if (orderId !== undefined && parsed.orderId !== orderId) {
      return null;
    }

    return {
      orderId: parsed.orderId,
      phone: parsed.phone,
    };
  } catch {
    return null;
  }
}
