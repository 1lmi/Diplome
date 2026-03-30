import type {
  AdminCategory,
  AdminOrder,
  AdminProduct,
  AuthResponse,
  Category,
  MenuItem,
  Order,
  OrderCreate,
  SettingsMap,
  StatusOption,
  UserAddress,
  UserAddressCreate,
  UserAddressPatch,
} from "./types";

export const API_BASE = "http://localhost:8000";
const AUTH_TOKEN_KEY = "sc_restaurant_auth_token";
const LEGACY_AUTH_TOKEN_KEYS = ["auth_token"];

function readAuthTokenFromStorage() {
  if (typeof localStorage === "undefined") return null;

  const current = localStorage.getItem(AUTH_TOKEN_KEY);
  if (current) {
    return current;
  }

  for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue) {
      localStorage.setItem(AUTH_TOKEN_KEY, legacyValue);
      localStorage.removeItem(legacyKey);
      return legacyValue;
    }
  }

  return null;
}

let authToken: string | null = readAuthTokenFromStorage();

export function resolveStaticImageUrl(imagePath?: string | null) {
  if (!imagePath) return "";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  if (imagePath.startsWith("/")) return `${API_BASE}${imagePath}`;
  return `${API_BASE}/static/${imagePath}`;
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof localStorage === "undefined") return;

  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
      if (legacyKey !== AUTH_TOKEN_KEY) {
        localStorage.removeItem(legacyKey);
      }
    }
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(API_BASE + url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setAuthToken(null);
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || `API error ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return null as T;
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  return (res.text() as unknown) as T;
}

export const api = {
  getSettings(): Promise<SettingsMap> {
    return request("/settings");
  },

  getStatuses(): Promise<StatusOption[]> {
    return request("/order-statuses");
  },

  getCategories(): Promise<Category[]> {
    return request("/categories");
  },

  getMenu(categoryId?: number): Promise<MenuItem[]> {
    const query = categoryId ? `?category_id=${categoryId}` : "";
    return request(`/menu${query}`);
  },

  createOrder(body: OrderCreate): Promise<Order> {
    return request("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  trackOrder(orderId: number, phone: string): Promise<Order> {
    const params = new URLSearchParams({
      order_id: String(orderId),
      phone,
    });
    return request(`/orders/track?${params.toString()}`);
  },

  getMyOrders(): Promise<Order[]> {
    return request("/me/orders");
  },

  getOrder(orderId: number, phone?: string): Promise<Order> {
    const params = new URLSearchParams();
    if (phone) {
      params.set("phone", phone);
    }

    const query = params.toString();
    return request(`/orders/${orderId}${query ? `?${query}` : ""}`);
  },

  register(
    firstName: string,
    login: string,
    password: string,
    lastName?: string,
    birthDate?: string,
    gender?: string
  ): Promise<AuthResponse> {
    return request("/auth/register", {
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

  login(login: string, password: string): Promise<AuthResponse> {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
  },

  me(): Promise<AuthResponse["user"]> {
    return request("/auth/me");
  },

  updateProfile(payload: {
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
  }): Promise<AuthResponse["user"]> {
    return request("/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  getMyAddresses(): Promise<UserAddress[]> {
    return request("/me/addresses");
  },

  createAddress(payload: UserAddressCreate): Promise<UserAddress> {
    return request("/me/addresses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateAddress(id: number, payload: UserAddressPatch): Promise<UserAddress> {
    return request(`/me/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteAddress(id: number): Promise<{ ok: boolean }> {
    return request(`/me/addresses/${id}`, {
      method: "DELETE",
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return request("/auth/logout", { method: "POST" });
  },

  adminMenu(): Promise<AdminCategory[]> {
    return request("/admin/menu");
  },

  createCategory(payload: {
    name: string;
    description?: string;
    sort_order?: number;
    is_hidden?: boolean;
  }): Promise<Category> {
    return request("/admin/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateCategory(id: number, payload: Partial<Category>): Promise<Category> {
    return request(`/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteCategory(id: number, deleteProducts?: boolean): Promise<{ ok: boolean }> {
    const query = deleteProducts ? "?delete_products=true" : "";
    return request(`/admin/categories/${id}${query}`, { method: "DELETE" });
  },

  createProduct(payload: {
    category_id: number;
    name: string;
    description?: string;
    image_path?: string;
    is_hidden?: boolean;
    is_active?: boolean;
    sort_order?: number;
    price?: number;
    size_name?: string;
    size_amount?: number;
    size_unit?: string;
    sizes?: {
      size_name: string;
      amount?: number;
      unit?: string;
      price: number;
      is_hidden?: boolean;
    }[];
  }): Promise<AdminProduct> {
    const normalizedSizes =
      payload.sizes && payload.sizes.length
        ? payload.sizes.map((size) => ({
            size_name: size.size_name,
            amount: size.amount,
            unit: size.unit,
            price: size.price,
            is_hidden: size.is_hidden ?? false,
          }))
        : [
            {
              size_name: payload.size_name ?? "Стандарт",
              amount: payload.size_amount,
              unit: payload.size_unit,
              price: payload.price ?? 0,
              is_hidden: false,
            },
          ];

    return request("/admin/products", {
      method: "POST",
      body: JSON.stringify({
        category_id: payload.category_id,
        name: payload.name,
        description: payload.description,
        image_path: payload.image_path,
        is_hidden: payload.is_hidden ?? false,
        is_active: payload.is_active ?? true,
        sort_order: payload.sort_order ?? 0,
        sizes: normalizedSizes,
      }),
    });
  },

  updateProduct(id: number, payload: any): Promise<AdminProduct> {
    return request(`/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteProduct(id: number): Promise<{ ok: boolean }> {
    return request(`/admin/products/${id}`, { method: "DELETE" });
  },

  uploadImage(file: File): Promise<{ filename: string; url: string }> {
    const form = new FormData();
    form.append("file", file);
    return request("/admin/upload-image", {
      method: "POST",
      body: form,
      headers: {},
    });
  },

  updateSettings(values: Record<string, string>): Promise<{ ok: boolean }> {
    return request("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ values }),
    });
  },

  adminOrders(status?: string): Promise<AdminOrder[]> {
    const query = status ? `?status=${status}` : "";
    return request(`/admin/orders${query}`);
  },

  updateOrderStatus(orderId: number, status_code: string, comment?: string): Promise<Order> {
    return request(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status_code, comment }),
    });
  },
};
