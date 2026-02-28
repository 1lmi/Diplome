import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, CheckoutDraft, MenuItem } from "./types";

const STORAGE_KEY = "meatpoint_cart_v2";

const defaultCheckoutDraft: CheckoutDraft = {
  guestMode: false,
  customerName: "",
  customerPhone: "",
  deliveryMethod: "delivery",
  address: "",
  deliveryTime: "",
  comment: "",
  paymentMethod: "cash",
  cashChangeFrom: "",
  doNotCall: false,
};

interface PersistedCartState {
  items: CartItem[];
  checkoutDraft: CheckoutDraft;
}

interface CartContextValue {
  items: CartItem[];
  totalPrice: number;
  totalCount: number;
  lineCount: number;
  checkoutDraft: CheckoutDraft;
  addProduct(item: MenuItem, quantity?: number): void;
  changeQuantity(productSizeId: number, quantity: number): void;
  removeItem(productSizeId: number): void;
  clear(): void;
  updateCheckoutDraft(patch: Partial<CheckoutDraft>): void;
  resetCheckoutDraft(): void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function sanitizeCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CartItem>;
  if (
    typeof item.productSizeId !== "number" ||
    typeof item.name !== "string" ||
    typeof item.productName !== "string" ||
    typeof item.imageUrl !== "string" ||
    typeof item.price !== "number" ||
    typeof item.quantity !== "number"
  ) {
    return null;
  }

  return {
    productSizeId: item.productSizeId,
    name: item.name,
    productName: item.productName,
    sizeLabel: typeof item.sizeLabel === "string" ? item.sizeLabel : null,
    sizeAmount: typeof item.sizeAmount === "number" ? item.sizeAmount : null,
    sizeUnit: typeof item.sizeUnit === "string" ? item.sizeUnit : null,
    imageUrl: item.imageUrl,
    price: item.price,
    quantity: item.quantity > 0 ? item.quantity : 1,
  };
}

function sanitizeCheckoutDraft(value: unknown): CheckoutDraft {
  if (!value || typeof value !== "object") {
    return defaultCheckoutDraft;
  }

  const draft = value as Partial<CheckoutDraft>;
  return {
    guestMode: Boolean(draft.guestMode),
    customerName: typeof draft.customerName === "string" ? draft.customerName : "",
    customerPhone: typeof draft.customerPhone === "string" ? draft.customerPhone : "",
    deliveryMethod: draft.deliveryMethod === "pickup" ? "pickup" : "delivery",
    address: typeof draft.address === "string" ? draft.address : "",
    deliveryTime: typeof draft.deliveryTime === "string" ? draft.deliveryTime : "",
    comment: typeof draft.comment === "string" ? draft.comment : "",
    paymentMethod: draft.paymentMethod === "card" ? "card" : "cash",
    cashChangeFrom: typeof draft.cashChangeFrom === "string" ? draft.cashChangeFrom : "",
    doNotCall: Boolean(draft.doNotCall),
  };
}

function readPersistedState(): PersistedCartState {
  if (typeof window === "undefined") {
    return { items: [], checkoutDraft: defaultCheckoutDraft };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { items: [], checkoutDraft: defaultCheckoutDraft };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedCartState>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(sanitizeCartItem).filter(Boolean) as CartItem[]
      : [];

    return {
      items,
      checkoutDraft: sanitizeCheckoutDraft(parsed.checkoutDraft),
    };
  } catch {
    return { items: [], checkoutDraft: defaultCheckoutDraft };
  }
}

function buildCartItem(product: MenuItem, quantity: number): CartItem {
  const productName =
    (product.product_name && product.product_name.trim()) ||
    product.name.replace(/\s*\([^)]*\)\s*$/, "");

  return {
    productSizeId: product.id,
    name: product.name,
    productName,
    sizeLabel: product.size_label ?? null,
    sizeAmount: product.size_amount ?? null,
    sizeUnit: product.size_unit ?? null,
    imageUrl: product.image_url,
    price: product.price,
    quantity,
  };
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const persisted = useMemo(readPersistedState, []);
  const [items, setItems] = useState<CartItem[]>(persisted.items);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft>(persisted.checkoutDraft);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state: PersistedCartState = { items, checkoutDraft };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [items, checkoutDraft]);

  const addProduct = (product: MenuItem, quantity: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productSizeId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productSizeId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [...prev, buildCartItem(product, quantity)];
    });
  };

  const changeQuantity = (id: number, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.productSizeId !== id));
      return;
    }

    setItems((prev) =>
      prev.map((item) => (item.productSizeId === id ? { ...item, quantity } : item))
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.productSizeId !== id));
  };

  const clear = () => setItems([]);

  const updateCheckoutDraft = (patch: Partial<CheckoutDraft>) => {
    setCheckoutDraft((prev) => ({ ...prev, ...patch }));
  };

  const resetCheckoutDraft = () => {
    setCheckoutDraft(defaultCheckoutDraft);
  };

  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );
  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const lineCount = items.length;

  const value: CartContextValue = {
    items,
    totalPrice,
    totalCount,
    lineCount,
    checkoutDraft,
    addProduct,
    changeQuantity,
    removeItem,
    clear,
    updateCheckoutDraft,
    resetCheckoutDraft,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
