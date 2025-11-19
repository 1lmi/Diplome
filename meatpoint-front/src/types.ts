export interface Category {
  id: number;
  name: string;
  description?: string | null;
}

export interface MenuItem {
  id: number;            // id product_sizes (v_menu_items.id)
  category_id: number;
  name: string;
  price: number;
  description?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
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
