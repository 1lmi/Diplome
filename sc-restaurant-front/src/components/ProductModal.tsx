import React, { useEffect, useState } from "react";
import type { MenuItem, ProductDisplay } from "../types";
import { useCart } from "../cartContext";
import { useToast } from "../ui/ToastProvider";

interface Props {
  product: ProductDisplay | null;
  onClose: () => void;
}

export const ProductModal: React.FC<Props> = ({ product, onClose }) => {
  const { addProduct } = useCart();
  const { pushToast } = useToast();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!product?.variants?.length) return;
    setVariantId(product.variants[0].id);
    setClosing(false);
    setAdding(false);
  }, [product]);

  if (!product) return null;

  const variant =
    product.variants.find((item: MenuItem) => item.id === variantId) || product.variants[0];

  const weightValue =
    variant?.size_amount !== undefined && variant?.size_amount !== null
      ? `${variant.size_amount}${variant.size_unit ? ` ${variant.size_unit}` : ""}`
      : null;

  const currentVariantLabel =
    variant?.size_name ||
    variant?.size_label ||
    (product.variants.length > 1 ? "Выбранный размер" : "Подача");

  const hasNutrition =
    !!variant &&
    [variant.calories, variant.carbs, variant.protein, variant.fat].some(
      (value) => value !== null && value !== undefined
    );

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  const handleAdd = () => {
    if (!variant || adding) return;
    setAdding(true);
    addProduct(variant, 1);
    pushToast({
      tone: "success",
      title: "Товар добавлен в корзину",
      description: `${product.name}${currentVariantLabel ? ` · ${currentVariantLabel}` : ""}`,
    });
    window.setTimeout(() => {
      handleClose();
    }, 320);
  };

  return (
    <div
      className="modal-backdrop"
      data-leave={closing ? "true" : undefined}
      onClick={handleClose}
    >
      <div
        className="modal modal--wide product-modal"
        data-leave={closing ? "true" : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose}>
          ×
        </button>
        <div className="modal__content">
          <div className="modal__image-wrap">
            <div className="product-modal__image-card">
              <img className="modal__image" src={product.image_url} alt={product.name} />
            </div>
          </div>

          <div className="modal__info">
            <div className="product-modal__header">
              <h2 className="modal__title">{product.name}</h2>
              {weightValue ? <div className="product-modal__weight">{weightValue}</div> : null}
              <p className="modal__subtitle product-modal__description">
                {product.description ||
                  "Описание скоро появится. Пока можно ориентироваться на размер, состав и стоимость."}
              </p>
            </div>

            {product.variants.length > 1 ? (
              <div className="product-modal__section">
                <p className="product-modal__section-title">Размер и цена</p>
                <div className="size-tabs">
                  {product.variants.map((item) => {
                    const label = item.size_name || item.size_label || "Размер";
                    const amount =
                      item.size_amount !== undefined && item.size_amount !== null
                        ? `${item.size_amount}${item.size_unit ? ` ${item.size_unit}` : ""}`
                        : null;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={"size-tab" + (variantId === item.id ? " size-tab--active" : "")}
                        onClick={() => setVariantId(item.id)}
                      >
                        <span className="size-tab__label">{label}</span>
                        <span className="size-tab__meta">
                          {amount ? `${amount} · ` : ""}
                          {item.price} руб.
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="product-modal__section">
                <p className="product-modal__section-title">Формат</p>
                <div className="size-tabs">
                  <button type="button" className="size-tab size-tab--active">
                    <span className="size-tab__label">
                      {variant?.size_name || variant?.size_label || "Стандарт"}
                    </span>
                    <span className="size-tab__meta">{variant?.price || 0} руб.</span>
                  </button>
                </div>
              </div>
            )}

            {hasNutrition ? (
              <div className="product-modal__section">
                <p className="product-modal__section-title">Пищевая ценность</p>
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
                <div className="stat-note">* На 100 грамм</div>
              </div>
            ) : null}

            <div className="product-modal__footer">
              <div className="product-modal__price-box">
                <span className="product-modal__price-label">{currentVariantLabel}</span>
                <span className="product-modal__price">{variant?.price || 0} руб.</span>
              </div>
              <button
                className={"btn btn--primary" + (adding ? " btn--success" : "")}
                type="button"
                onClick={handleAdd}
                disabled={adding}
              >
                {adding ? "Добавлено" : "Добавить в корзину"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
