import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { mobileApi } from "@/src/api/mobile-api";
import type { AuthResponse, User } from "@/src/api/types";
import { setApiToken } from "@/src/api/client";
import { loadStoredPushToken } from "@/src/lib/notifications";

const TOKEN_KEY = "sc-restaurant-mobile-auth-token";
const LEGACY_TOKEN_KEYS = ["meatpoint-mobile-auth-token"];

async function readTokenWithMigration() {
  const current = await SecureStore.getItemAsync(TOKEN_KEY);
  if (current) {
    return current;
  }

  for (const legacyKey of LEGACY_TOKEN_KEYS) {
    const legacyValue = await SecureStore.getItemAsync(legacyKey);
    if (legacyValue) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacyValue);
      await SecureStore.deleteItemAsync(legacyKey);
      return legacyValue;
    }
  }

  return null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  bootstrapping: boolean;
  bootstrap(): Promise<void>;
  completeAuth(payload: AuthResponse): Promise<void>;
  updateUser(user: User): void;
  refreshUser(): Promise<void>;
  clearSession(): Promise<void>;
  logout(): Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  bootstrapping: false,
  async bootstrap() {
    if (get().hydrated || get().bootstrapping) return;

    set({ bootstrapping: true });

    try {
      const token = await readTokenWithMigration();
      if (!token) {
        setApiToken(null);
        set({ token: null, user: null, hydrated: true, bootstrapping: false });
        return;
      }

      setApiToken(token);
      const user = await mobileApi.me();
      set({ token, user, hydrated: true, bootstrapping: false });
    } catch {
      setApiToken(null);
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      for (const legacyKey of LEGACY_TOKEN_KEYS) {
        await SecureStore.deleteItemAsync(legacyKey);
      }
      set({ token: null, user: null, hydrated: true, bootstrapping: false });
    }
  },
  async completeAuth(payload) {
    setApiToken(payload.token);
    await SecureStore.setItemAsync(TOKEN_KEY, payload.token);
    for (const legacyKey of LEGACY_TOKEN_KEYS) {
      await SecureStore.deleteItemAsync(legacyKey);
    }
    set({
      token: payload.token,
      user: payload.user,
    });
  },
  updateUser(user) {
    set({ user });
  },
  async refreshUser() {
    const token = get().token;
    if (!token) return;
    setApiToken(token);
    const user = await mobileApi.me();
    set({ user });
  },
  async clearSession() {
    setApiToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    for (const legacyKey of LEGACY_TOKEN_KEYS) {
      await SecureStore.deleteItemAsync(legacyKey);
    }
    set({ token: null, user: null, hydrated: true, bootstrapping: false });
  },
  async logout() {
    const pushToken = await loadStoredPushToken();
    if (pushToken) {
      try {
        await mobileApi.unregisterPushToken(pushToken);
      } catch {
        // Ignore push token unregister races during logout.
      }
    }
    try {
      await mobileApi.logout();
    } catch {
      // Ignore network/logout races. Local session still must be cleared.
    }
    await get().clearSession();
  },
}));
