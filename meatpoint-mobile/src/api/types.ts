export interface Category {
  id: number;
  name: string;
  description?: string | null;
  sort_order: number;
  is_hidden?: boolean;
}

export interface MenuItem {
  id: number;
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

export interface ProductDisplay {
  id: number;
  key: string;
  category_id: number;
  name: string;
  description?: string | null;
  image_url: string;
  variants: MenuItem[];
  minPrice: number;
}

export interface CartItem {
  productSizeId: number;
  name: string;
  productName: string;
  sizeLabel?: string | null;
  sizeAmount?: number | null;
  sizeUnit?: string | null;
  imageUrl: string;
  price: number;
  quantity: number;
}

export interface CheckoutDraft {
  guestMode: boolean;
  customerName: string;
  customerPhone: string;
  deliveryMethod: "delivery" | "pickup";
  address: string;
  deliveryTime: string;
  comment: string;
  paymentMethod: "cash" | "card";
  cashChangeFrom: string;
  doNotCall: boolean;
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
  delivery_method?: "delivery" | "pickup";
  delivery_time?: string | null;
  payment_method?: "cash" | "card";
  cash_change_from?: number | null;
  do_not_call?: boolean;
  comment?: string | null;
  items: OrderCreateItem[];
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
  delivery_method?: "delivery" | "pickup" | null;
  delivery_time?: string | null;
  payment_method?: "cash" | "card" | null;
  cash_change_from?: number | null;
  do_not_call?: boolean | null;
  items: OrderLine[];
  history: OrderHistoryItem[];
}

export interface User {
  id: number;
  first_name: string;
  last_name?: string | null;
  login: string;
  full_name: string;
  name: string;
  birth_date?: string | null;
  gender?: string | null;
  is_admin: boolean;
}

export interface UserAddress {
  id: number;
  label?: string | null;
  address: string;
  is_default: boolean;
  created_at: string;
}

export interface UserAddressCreate {
  label?: string | null;
  address: string;
  is_default?: boolean;
}

export interface UserAddressPatch {
  label?: string | null;
  address?: string;
  is_default?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SettingsMap {
  [key: string]: string;
}

export interface TrackingRecord {
  orderId: number;
  phone: string;
  savedAt: number;
}

export type DeliveryMethod = CheckoutDraft["deliveryMethod"];

export type PaymentMethod = CheckoutDraft["paymentMethod"];
