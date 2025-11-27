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

  const weightValue =
    variant?.size_amount !== undefined && variant?.size_amount !== null
      ? `${variant.size_amount}${variant.size_unit ? ` ${variant.size_unit}` : ""}`
      : null;

  const hasNutrition =
    !!variant &&
    [variant.calories, variant.carbs, variant.protein, variant.fat].some(
      (value) => value !== null && value !== undefined
    );

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
          {"×"}
        </button>
        <div className="modal__content">
          <div className="modal__image-wrap">
            <img className="modal__image" src={product.image_url} alt={product.name} />
          </div>
          <div className="modal__info">
            <h2 className="modal__title">{product.name}</h2>
            {weightValue && <div className="modal__subtitle">{weightValue}</div>}
            <p className="modal__subtitle">
              {product.description || "ÐÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¿Ð¾ÐºÐ° Ð¿ÑÑÑÐ¾, Ð½Ð¾ Ð¼Ñ ÑÐ¶Ðµ Ð³Ð¾ÑÐ¾Ð²Ð¸Ð¼ ÐµÐ³Ð¾ Ð´Ð»Ñ Meat Point"}
            </p>

            {product.variants.length > 1 && (
              <div className="size-tabs">
                {product.variants.map((v) => {
                  const label = v.size_name || v.size_label || "Ð Ð°Ð·Ð¼ÐµÑ";
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

            {hasNutrition && (
              <>
                <div className="stat-cards">
                  <div className="stat-card">
                    <div className="stat-card__value">{variant?.calories ?? "-"}</div>
                    <div className="stat-card__label">Калории</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__value">{variant?.carbs ?? "-"}</div>
                    <div className="stat-card__label">Углеводы</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__value">{variant?.protein ?? "-"}</div>
                    <div className="stat-card__label">Белки</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__value">{variant?.fat ?? "-"}</div>
                    <div className="stat-card__label">Жиры</div>
                  </div>
                </div>
                <div className="stat-note">*На 100 грамм</div>
              </>
            )}

            <button className="btn btn--primary btn--full" onClick={handleAdd}>
              {`В корзину за ${variant?.price || 0} руб.`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
