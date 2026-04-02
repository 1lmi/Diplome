import React, { useEffect, useRef, useState } from "react";
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
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const nutritionRef = useRef<HTMLDivElement | null>(null);

  const formatNutritionValue = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "-"
      : new Intl.NumberFormat("ru-RU", {
          minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
          maximumFractionDigits: 1,
        }).format(value);

  useEffect(() => {
    if (!product?.variants?.length) return;
    setVariantId(product.variants[0].id);
    setClosing(false);
    setAdding(false);
    setNutritionOpen(false);
  }, [product]);

  useEffect(() => {
    setNutritionOpen(false);
  }, [variantId]);

  useEffect(() => {
    if (!nutritionOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!nutritionRef.current?.contains(event.target as Node)) {
        setNutritionOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNutritionOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [nutritionOpen]);

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

  const nutritionRows = [
    { label: "Энерг. ценн.", value: formatNutritionValue(variant?.calories), unit: "Ккал" },
    { label: "Белки", value: formatNutritionValue(variant?.protein), unit: "грамм" },
    { label: "Жиры", value: formatNutritionValue(variant?.fat), unit: "грамм" },
    { label: "Углеводы", value: formatNutritionValue(variant?.carbs), unit: "грамм" },
  ];

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
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={"size-tab" + (variantId === item.id ? " size-tab--active" : "")}
                        onClick={() => setVariantId(item.id)}
                      >
                        <span className="size-tab__label">{label}</span>

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
              <div className="product-modal__section product-modal__section--nutrition">
                <div className="product-modal__nutrition" ref={nutritionRef}>
                  <span className="product-modal__nutrition-label">Пищевая ценность</span>
                  <button
                    type="button"
                    className="product-modal__nutrition-toggle"
                    aria-expanded={nutritionOpen}
                    aria-label="Показать пищевую ценность"
                    onClick={() => setNutritionOpen((prev) => !prev)}
                  >
                    <span className="product-modal__nutrition-icon" aria-hidden="true">
                      i
                    </span>
                  </button>

                  {nutritionOpen ? (
                    <div className="product-modal__nutrition-popover" role="dialog" aria-modal="false">
                      <div className="product-modal__nutrition-popover-title">
                        Пищевая ценность на 100 г
                      </div>
                      <div className="product-modal__nutrition-rows">
                        {nutritionRows.map((row) => (
                          <div key={row.label} className="product-modal__nutrition-row">
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                            <span>{row.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
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
