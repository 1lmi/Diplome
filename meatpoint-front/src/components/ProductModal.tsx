import React, { useEffect, useState } from "react";
import type { MenuItem } from "../types";
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
  const [variantId, setVariantId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (product?.variants?.length) {
      setVariantId(product.variants[0].id);
      setClosing(false);
    }
  }, [product]);

  if (!product) return null;

  const variant =
    product.variants.find((v) => v.id === variantId) || product.variants[0];

  const sizeMatch = variant?.name.match(/\(([^)]+)\)$/);
  const sizeLabel = sizeMatch ? sizeMatch[1] : "Размер";
  const weightMatch = sizeLabel.match(/(\d+)\s*(г|гр|ml|мл)/i);
  const weightLabel = weightMatch ? `${weightMatch[1]} ${weightMatch[2]}` : "—";

  const handleAdd = () => {
    if (!variant) return;
    addProduct(variant, 1);
    handleClose();
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  return (
    <div
      className="modal-backdrop"
      data-leave={closing ? "true" : undefined}
      onClick={handleClose}
    >
      <div
        className="modal modal--wide"
        data-leave={closing ? "true" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose}>
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
              <div className="size-tabs">
                {product.variants.map((v) => {
                  const label = v.name.match(/\(([^)]+)\)$/)?.[1] || "Размер";
                  return (
                    <button
                      key={v.id}
                      className={
                        "size-tab" + (variantId === v.id ? " size-tab--active" : "")
                      }
                      onClick={() => setVariantId(v.id)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="stat-cards">
              <div className="stat-card">
                <div className="stat-card__value">{variant?.carbs ?? "—"}</div>
                <div className="stat-card__label">Углеводы</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{variant?.calories ?? "—"}</div>
                <div className="stat-card__label">Ккал</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{variant?.protein ?? "—"}</div>
                <div className="stat-card__label">Белки</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{variant?.fat ?? "—"}</div>
                <div className="stat-card__label">Жиры</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{weightLabel}</div>
                <div className="stat-card__label">Вес</div>
              </div>
            </div>

            <div className="stat-note">*Пищевая ценность на 100 г</div>

            <button className="btn btn--primary btn--full" onClick={handleAdd}>
              В корзину за {variant?.price || 0} руб.
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
