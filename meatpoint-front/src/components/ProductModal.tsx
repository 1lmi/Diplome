import React, { useState } from "react";
import type { MenuItem } from "../types";
import { QuantityControl } from "./QuantityControl";
import { useCart } from "../cartContext";

interface Props {
  product: MenuItem | null;
  onClose: () => void;
}

export const ProductModal: React.FC<Props> = ({ product, onClose }) => {
  const { addProduct } = useCart();
  const [qty, setQty] = useState(1);

  if (!product) return null;

  const handleAdd = () => {
    addProduct(product, qty);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <button className="modal__close" onClick={onClose}>
          ×
        </button>
        <div className="modal__content">
          <div className="modal__image-wrap">
            <div className="modal__image" />
          </div>
          <div className="modal__info">
            <h2 className="modal__title">{product.name}</h2>
            <p className="modal__subtitle">
              {product.description || "Вкуснейшее блюдо от Meat Point"}
            </p>

            {product.calories && (
              <p className="modal__kbzu">
                {product.calories} ккал • Б {product.protein} • Ж{" "}
                {product.fat} • У {product.carbs}
              </p>
            )}

            <div className="modal__controls">
              <QuantityControl value={qty} onChange={setQty} />
            </div>

            <button className="btn btn--primary btn--full" onClick={handleAdd}>
              В корзину за {product.price * qty} ₽
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
