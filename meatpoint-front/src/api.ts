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
} from "./types";

const API_BASE = "http://localhost:8000";

let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof localStorage === "undefined") return;
  if (token) {
    localStorage.setItem("auth_token", token);
  } else {
    localStorage.removeItem("auth_token");
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
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
    throw new Error(text || `API error ${res.status}`);
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
  // Public
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
    const q = categoryId ? `?category_id=${categoryId}` : "";
    return request(`/menu${q}`);
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
  // Auth
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
  logout(): Promise<{ ok: boolean }> {
    return request("/auth/logout", { method: "POST" });
  },
  // Admin/menu
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
  deleteCategory(id: number): Promise<{ ok: boolean }> {
    return request(`/admin/categories/${id}`, { method: "DELETE" });
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
    sizes?: { size_name: string; amount?: number; unit?: string; price: number; is_hidden?: boolean }[];
  }): Promise<AdminProduct> {
    const normalizedSizes =
      payload.sizes && payload.sizes.length
        ? payload.sizes.map((s) => ({
            size_name: s.size_name,
            amount: s.amount,
            unit: s.unit,
            price: s.price,
            is_hidden: s.is_hidden ?? false,
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
    const body = {
      category_id: payload.category_id,
      name: payload.name,
      description: payload.description,
      image_path: payload.image_path,
      is_hidden: payload.is_hidden ?? false,
      is_active: payload.is_active ?? true,
      sort_order: payload.sort_order ?? 0,
      sizes: normalizedSizes,
    };
    return request("/admin/products", {
      method: "POST",
      body: JSON.stringify(body),
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
    const q = status ? `?status=${status}` : "";
    return request(`/admin/orders${q}`);
  },
  updateOrderStatus(orderId: number, status_code: string, comment?: string): Promise<Order> {
    return request(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status_code, comment }),
    });
  },
};



