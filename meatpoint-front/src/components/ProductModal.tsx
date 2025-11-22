import React, { useEffect, useState } from "react";
import type { MenuItem } from "../types";
import { QuantityControl } from "./QuantityControl";
import { useCart } from "../cartContext";

interface ProductDisplay {
  name: string;
  description?: string | null;
  image_url: string;
  variants: MenuItem[];
}

interface Props {
  product: ProductDisplay | null;
  onClose: () => void;
}

export const ProductModal: React.FC<Props> = ({ product, onClose }) => {
  const { addProduct } = useCart();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<number | null>(null);

  useEffect(() => {
    if (product?.variants?.length) {
      setVariantId(product.variants[0].id);
      setQty(1);
    }
  }, [product]);

  if (!product) return null;

  const variant =
    product.variants.find((v) => v.id === variantId) || product.variants[0];

  const handleAdd = () => {
    if (!variant) return;
    addProduct(variant, qty);
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
            <img className="modal__image" src={product.image_url} alt={product.name} />
          </div>
          <div className="modal__info">
            <h2 className="modal__title">{product.name}</h2>
            <p className="modal__subtitle">
              {product.description || "Ароматное блюдо от Meat Point"}
            </p>

            {variant?.calories && (
              <p className="modal__kbzu">
                {variant.calories} ккал · Б {variant.protein} · Ж {variant.fat} · У{" "}
                {variant.carbs}
              </p>
            )}

            {product.variants.length > 1 && (
              <div className="chip-row">
                {product.variants.map((v) => {
                  const sizeMatch = v.name.match(/\(([^)]+)\)$/);
                  const sizeLabel = sizeMatch ? sizeMatch[1] : "Размер";
                  return (
                    <button
                      key={v.id}
                      className={
                        "chip" + (variantId === v.id ? " chip--active" : "")
                      }
                      onClick={() => setVariantId(v.id)}
                    >
                      {sizeLabel} · {v.price} руб.
                    </button>
                  );
                })}
              </div>
            )}

            <div className="modal__controls">
              <QuantityControl value={qty} onChange={setQty} />
            </div>

            <button className="btn btn--primary btn--full" onClick={handleAdd}>
              В корзину за {(variant?.price || 0) * qty} руб.
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
