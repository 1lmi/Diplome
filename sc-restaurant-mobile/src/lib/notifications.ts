import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PUSH_TOKEN_KEY = "sc-restaurant-mobile-push-token";
const LEGACY_PUSH_TOKEN_KEYS = ["meatpoint-mobile-push-token"];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

function getProjectId() {
  const easProjectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra &&
    typeof Constants.expoConfig.extra === "object" &&
    "eas" in Constants.expoConfig.extra &&
    Constants.expoConfig.extra.eas &&
    typeof Constants.expoConfig.extra.eas === "object" &&
    "projectId" in Constants.expoConfig.extra.eas
      ? String(Constants.expoConfig.extra.eas.projectId || "")
      : "");

  return easProjectId || undefined;
}

export async function loadStoredPushToken() {
  const current = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (current) {
    return current;
  }

  for (const legacyKey of LEGACY_PUSH_TOKEN_KEYS) {
    const legacyValue = await SecureStore.getItemAsync(legacyKey);
    if (legacyValue) {
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, legacyValue);
      await SecureStore.deleteItemAsync(legacyKey);
      return legacyValue;
    }
  }

  return null;
}

export async function saveStoredPushToken(token: string | null) {
  if (!token) {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
    for (const legacyKey of LEGACY_PUSH_TOKEN_KEYS) {
      await SecureStore.deleteItemAsync(legacyKey);
    }
    return;
  }
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  for (const legacyKey of LEGACY_PUSH_TOKEN_KEYS) {
    await SecureStore.deleteItemAsync(legacyKey);
  }
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Статусы заказа",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E67A2E",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const projectId = getProjectId();

  if (!projectId) {
    return {
      permissionStatus: existing.status,
      expoPushToken: null as string | null,
    };
  }

  let finalStatus = existing.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return {
      permissionStatus: finalStatus,
      expoPushToken: null as string | null,
    };
  }

  if (!Device.isDevice) {
    return {
      permissionStatus: finalStatus,
      expoPushToken: null as string | null,
    };
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });

  return {
    permissionStatus: finalStatus,
    expoPushToken: tokenResponse.data,
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
