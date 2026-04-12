import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { mobileApi } from "@/src/api/mobile-api";
import {
  extractOrderIdFromNotificationData,
  loadStoredPushToken,
  registerForPushNotificationsAsync,
  saveStoredPushToken,
} from "@/src/lib/notifications";
import { useAuthStore } from "@/src/store/auth-store";

export function NotificationController() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const lastHandledIdentifier = useRef<string | null>(null);

  const invalidateOrderData = useCallback(
    (orderId: number | null) => {
      void queryClient.invalidateQueries({ queryKey: ["me-orders"] });
      if (orderId) {
        void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      }
    },
    [queryClient]
  );

  const openOrderFromNotification = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const identifier = response.notification.request.identifier;
      if (identifier && lastHandledIdentifier.current === identifier) {
        return;
      }
      lastHandledIdentifier.current = identifier;

      const orderId = extractOrderIdFromNotificationData(
        response.notification.request.content.data
      );
      invalidateOrderData(orderId);
      if (!orderId) return;

      router.push({
        pathname: "/order/[id]",
        params: { id: String(orderId) },
      });
    },
    [invalidateOrderData]
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const storedToken = await loadStoredPushToken();
        if (active && storedToken) {
          setExpoPushToken(storedToken);
        }

        const { expoPushToken: freshToken, permissionStatus } =
          await registerForPushNotificationsAsync();
        if (!active) return;

        if (permissionStatus !== "granted") {
          setExpoPushToken(null);
          await saveStoredPushToken(null);
          return;
        }

        if (!freshToken) {
          setExpoPushToken(null);
          await saveStoredPushToken(null);
          return;
        }

        setExpoPushToken(freshToken);
        await saveStoredPushToken(freshToken);
      } catch (error) {
        console.warn("Failed to initialize push notifications", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !user || !expoPushToken) return;

    let active = true;
    void (async () => {
      try {
        await mobileApi.registerPushToken(expoPushToken, Platform.OS);
      } catch (error) {
        if (active) {
          console.warn("Failed to register push token", error);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [expoPushToken, hydrated, user]);

  useEffect(() => {
    const receiveSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const orderId = extractOrderIdFromNotificationData(
          notification.request.content.data
        );
        invalidateOrderData(orderId);
      }
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openOrderFromNotification(response);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      openOrderFromNotification(response);
    });

    return () => {
      receiveSubscription.remove();
      responseSubscription.remove();
    };
  }, [invalidateOrderData, openOrderFromNotification]);

  return null;
}
