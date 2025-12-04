export interface Category {
  id: number;
  name: string;
  description?: string | null;
  sort_order: number;
  is_hidden?: boolean;
}

export interface MenuItem {
  id: number; // id product_sizes (v_menu_items.id)
  category_id: number;
  name: string;
  product_name?: string;
  size_name?: string | null;
  size_amount?: number | null;
  size_unit?: string | null;
  size_label?: string | null;
  price: number;
  description?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  image_path: string;
  image_url: string;
}

export interface CartItem {
  productSizeId: number;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderCreateItem {
  product_size_id: number;
  quantity: number;
}

export interface OrderCreate {
  customer: {
    name?: string | null;
    phone: string;
    address?: string | null;
  };
  comment?: string | null;
  items: OrderCreateItem[];
}

export interface ProductSize {
  id: number;
  name?: string | null;
  amount?: number | null;
  unit?: string | null;
  price: number;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  is_hidden: boolean;
}

export interface AdminProduct {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  image_path: string;
  image_url: string;
  is_hidden: boolean;
  is_active: boolean;
  sort_order: number;
  sizes: ProductSize[];
}

export interface AdminCategory {
  id: number;
  name: string;
  description?: string | null;
  sort_order: number;
  is_hidden: boolean;
  products: AdminProduct[];
}

export interface OrderHistoryItem {
  status: string;
  status_name: string;
  changed_at: string;
  comment?: string | null;
}

export interface OrderLine {
  product_size_id: number;
  product_name: string;
  size_name?: string | null;
  price: number;
  quantity: number;
  line_total: number;
  image_url?: string | null;
}

export interface Order {
  id: number;
  status: string;
  status_name: string;
  created_at: string;
  comment?: string | null;
  total_price: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  items: OrderLine[];
  history: OrderHistoryItem[];
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  login: string;
  full_name: string;
  name: string;
  is_admin: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface StatusOption {
  code: string;
  name: string;
}

export interface SettingsMap {
  [key: string]: string;
}

export type AdminOrder = Order;
