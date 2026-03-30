import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CartItem, CheckoutDraft, MenuItem } from "@/src/api/types";
import { createMigratingAsyncStorage } from "@/src/lib/migrating-storage";

const CART_STORAGE_KEY = "sc-restaurant-mobile-cart";
const LEGACY_CART_STORAGE_KEYS = ["meatpoint-mobile-cart"];

export const defaultCheckoutDraft: CheckoutDraft = {
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

interface CartState {
  items: CartItem[];
  checkoutDraft: CheckoutDraft;
  lastAddedAt: number | null;
  lastAddedName: string | null;
  addProduct(product: MenuItem, quantity?: number): void;
  changeQuantity(productSizeId: number, quantity: number): void;
  removeItem(productSizeId: number): void;
  clear(): void;
  updateCheckoutDraft(patch: Partial<CheckoutDraft>): void;
  resetCheckoutDraft(): void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      checkoutDraft: defaultCheckoutDraft,
      lastAddedAt: null,
      lastAddedName: null,
      addProduct(product, quantity = 1) {
        set((state) => {
          const existing = state.items.find((item) => item.productSizeId === product.id);
          const nextItems = existing
            ? state.items.map((item) =>
                item.productSizeId === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              )
            : [...state.items, buildCartItem(product, quantity)];

          return {
            items: nextItems,
            lastAddedAt: Date.now(),
            lastAddedName: product.product_name || product.name,
          };
        });
      },
      changeQuantity(productSizeId, quantity) {
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.productSizeId !== productSizeId)
              : state.items.map((item) =>
                  item.productSizeId === productSizeId ? { ...item, quantity } : item
                ),
        }));
      },
      removeItem(productSizeId) {
        set((state) => ({
          items: state.items.filter((item) => item.productSizeId !== productSizeId),
        }));
      },
      clear() {
        set({ items: [] });
      },
      updateCheckoutDraft(patch) {
        set((state) => ({
          checkoutDraft: {
            ...state.checkoutDraft,
            ...patch,
          },
        }));
      },
      resetCheckoutDraft() {
        set({ checkoutDraft: defaultCheckoutDraft });
      },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() =>
        createMigratingAsyncStorage(CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEYS)
      ),
      partialize: (state) => ({
        items: state.items,
        checkoutDraft: state.checkoutDraft,
      }),
    }
  )
);

export function getCartTotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getCartCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
