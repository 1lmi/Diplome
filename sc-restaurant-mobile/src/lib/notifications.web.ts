export async function loadStoredPushToken() {
  return null;
}

export async function saveStoredPushToken(_token: string | null) {
  return;
}

export async function registerForPushNotificationsAsync() {
  return {
    permissionStatus: "undetermined",
    expoPushToken: null as string | null,
  };
}

export function extractOrderIdFromNotificationData(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const raw =
    "orderId" in data
      ? (data as { orderId?: unknown }).orderId
      : "order_id" in data
        ? (data as { order_id?: unknown }).order_id
        : null;

  const orderId = Number(raw);
  return Number.isFinite(orderId) && orderId > 0 ? orderId : null;
}
