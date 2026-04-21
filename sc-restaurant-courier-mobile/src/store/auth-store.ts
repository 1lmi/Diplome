import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { setApiToken } from '@/src/api/client';
import { courierApi } from '@/src/api/courier-api';
import type { AuthResponse, User } from '@/src/api/types';

const TOKEN_KEY = 'sc-courier-mobile-auth-token';

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  bootstrapping: boolean;
  bootstrap(): Promise<void>;
  completeAuth(payload: AuthResponse): Promise<void>;
  refreshUser(): Promise<void>;
  clearSession(): Promise<void>;
  logout(): Promise<void>;
}

function ensureCourierUser(user: User) {
  if (!user.is_courier) {
    throw new Error('Этот аккаунт не имеет доступа к приложению курьера.');
  }
  if (user.courier_profile && !user.courier_profile.is_active) {
    throw new Error('Курьерский доступ отключён администратором.');
  }
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
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        setApiToken(null);
        set({ token: null, user: null, hydrated: true, bootstrapping: false });
        return;
      }

      setApiToken(token);
      const user = await courierApi.me();
      ensureCourierUser(user);
      set({ token, user, hydrated: true, bootstrapping: false });
    } catch {
      setApiToken(null);
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      set({ token: null, user: null, hydrated: true, bootstrapping: false });
    }
  },
  async completeAuth(payload) {
    ensureCourierUser(payload.user);
    setApiToken(payload.token);
    await SecureStore.setItemAsync(TOKEN_KEY, payload.token);
    set({ token: payload.token, user: payload.user });
  },
  async refreshUser() {
    const token = get().token;
    if (!token) return;
    setApiToken(token);
    const user = await courierApi.me();
    ensureCourierUser(user);
    set({ user });
  },
  async clearSession() {
    setApiToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, user: null, hydrated: true, bootstrapping: false });
  },
  async logout() {
    try {
      await courierApi.logout();
    } catch {
      // Ignore server logout races.
    }
    await get().clearSession();
  },
}));
