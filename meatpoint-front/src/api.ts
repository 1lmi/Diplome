import type { Category, MenuItem, OrderCreate } from "./types";

const API_BASE = "http://localhost:8000";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getCategories(): Promise<Category[]> {
    return request<Category[]>("/categories");
  },
  getMenu(categoryId?: number): Promise<MenuItem[]> {
    const q = categoryId ? `?category_id=${categoryId}` : "";
    return request<MenuItem[]>(`/menu${q}`);
  },
  createOrder(body: OrderCreate) {
    return request("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
