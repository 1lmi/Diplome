export interface CourierProfile {
  display_name: string;
  phone?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
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
  is_courier: boolean;
  courier_profile?: CourierProfile | null;
}

export interface AuthResponse {
  token: string;
  user: User;
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
  delivery_method?: 'delivery' | 'pickup' | null;
  delivery_time?: string | null;
  payment_method?: 'cash' | 'card' | null;
  cash_change_from?: number | null;
  do_not_call?: boolean | null;
  courier_id?: number | null;
  courier_name?: string | null;
  courier_phone?: string | null;
  ready_at?: string | null;
  claimed_at?: string | null;
  started_delivery_at?: string | null;
  delivered_at?: string | null;
  items: OrderLine[];
  history: OrderHistoryItem[];
}

export interface CourierBoard {
  cooking: Order[];
  ready: Order[];
  my_active?: Order | null;
}
