import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import "react-native-reanimated";

import { AppProviders } from "@/src/providers/AppProviders";
import { NotificationController } from "@/src/providers/NotificationController";
import { useAuthStore } from "@/src/store/auth-store";
import { colors } from "@/src/theme/tokens";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (hydrated) {
      void SplashScreen.hideAsync();
    }
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <>
      <NotificationController />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "simple_push",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="cart" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen
          name="product/[id]"
          options={{
            presentation: "transparentModal",
            animation: "fade",
          }}
        />
        <Stack.Screen name="checkout" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="order/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="auth/sign-in" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="auth/sign-up" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="profile/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="profile/orders" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="profile/edit" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="address/new" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="address/[id]" options={{ animation: "slide_from_right" }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
