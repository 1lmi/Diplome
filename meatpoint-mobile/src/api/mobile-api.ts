import type {
  AuthResponse,
  Category,
  MenuItem,
  Order,
  OrderCreate,
  SettingsMap,
  User,
  UserAddress,
  UserAddressCreate,
  UserAddressPatch,
} from "@/src/api/types";
import { request } from "@/src/api/client";

export const mobileApi = {
  getSettings() {
    return request<SettingsMap>("/settings");
  },

  getCategories() {
    return request<Category[]>("/categories");
  },

  getMenu(categoryId?: number) {
    const query = categoryId ? `?category_id=${categoryId}` : "";
    return request<MenuItem[]>(`/menu${query}`);
  },

  getMenuItem(itemId: number) {
    return request<MenuItem>(`/menu/${itemId}`);
  },

  createOrder(body: OrderCreate) {
    return request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getOrder(orderId: number, phone?: string) {
    const params = new URLSearchParams();
    if (phone?.trim()) {
      params.set("phone", phone.trim());
    }
    const query = params.toString();
    return request<Order>(`/orders/${orderId}${query ? `?${query}` : ""}`);
  },

  trackOrder(orderId: number, phone: string) {
    const params = new URLSearchParams({
      order_id: String(orderId),
      phone: phone.trim(),
    });
    return request<Order>(`/orders/track?${params.toString()}`);
  },

  register(
    firstName: string,
    login: string,
    password: string,
    lastName?: string,
    birthDate?: string,
    gender?: string
  ) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        login,
        password,
        birth_date: birthDate,
        gender,
      }),
    });
  },

  login(login: string, password: string) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
  },

  me() {
    return request<User>("/auth/me");
  },

  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },

  registerPushToken(token: string, platform: string) {
    return request<{ ok: boolean }>("/me/push-token", {
      method: "PUT",
      body: JSON.stringify({ token, platform }),
    });
  },

  unregisterPushToken(token: string) {
    return request<{ ok: boolean }>("/me/push-token", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    });
  },

  updateProfile(payload: {
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
  }) {
    return request<User>("/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  getMyOrders() {
    return request<Order[]>("/me/orders");
  },

  getMyAddresses() {
    return request<UserAddress[]>("/me/addresses");
  },

  createAddress(payload: UserAddressCreate) {
    return request<UserAddress>("/me/addresses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateAddress(id: number, payload: UserAddressPatch) {
    return request<UserAddress>(`/me/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteAddress(id: number) {
    return request<{ ok: boolean }>(`/me/addresses/${id}`, {
      method: "DELETE",
    });
  },
};
