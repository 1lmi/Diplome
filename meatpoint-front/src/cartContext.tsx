import React, { createContext, useContext, useMemo, useState } from "react";
import type { CartItem, MenuItem } from "./types";

interface CartContextValue {
  items: CartItem[];
  totalPrice: number;
  totalCount: number;
  addProduct(item: MenuItem, quantity?: number): void;
  changeQuantity(productSizeId: number, quantity: number): void;
  removeItem(productSizeId: number): void;
  clear(): void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addProduct = (product: MenuItem, quantity: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productSizeId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productSizeId === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [
        ...prev,
        {
          productSizeId: product.id,
          name: product.name,
          price: product.price,
          quantity,
        },
      ];
    });
  };

  const changeQuantity = (id: number, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.productSizeId !== id));
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.productSizeId === id ? { ...i, quantity } : i
      )
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((i) => i.productSizeId !== id));
  };

  const clear = () => setItems([]);

  const totalPrice = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );
  const totalCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const value: CartContextValue = {
    items,
    totalPrice,
    totalCount,
    addProduct,
    changeQuantity,
    removeItem,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
