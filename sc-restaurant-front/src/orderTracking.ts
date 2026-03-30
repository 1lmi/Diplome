const STORAGE_KEY = "sc_restaurant_latest_order_tracking";
const LEGACY_STORAGE_KEYS = ["meatpoint_latest_order_tracking"];

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
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    window.sessionStorage.removeItem(legacyKey);
  }
}

export function getOrderTracking(orderId?: number): StoredTracking | null {
  if (typeof window === "undefined") return null;

  try {
    let raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = window.sessionStorage.getItem(legacyKey);
        if (legacyRaw) {
          raw = legacyRaw;
          window.sessionStorage.setItem(STORAGE_KEY, legacyRaw);
          window.sessionStorage.removeItem(legacyKey);
          break;
        }
      }
    }
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
