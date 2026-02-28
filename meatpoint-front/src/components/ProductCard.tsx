import React from "react";
import type { MenuItem } from "../types";

interface ProductDisplay {
  key: string;
  name: string;
  description?: string | null;
  image_url: string;
  minPrice: number;
  variants: MenuItem[];
}

interface Props {
  product: ProductDisplay;
  onClick: () => void;
}

export const ProductCard: React.FC<Props> = ({ product, onClick }) => {
  const hasVariants = product.variants.length > 1;

  return (
    <article className="product-card">
      <div className="product-card__image-wrap">
        {hasVariants && (
          <span className="chip chip--ghost product-card__tag">
            {product.variants.length} варианта
          </span>
        )}
        <img
          className="product-card__image"
          src={product.image_url || "/img/default.png"}
          alt={product.name}
          loading="lazy"
        />
      </div>
      <div className="product-card__body">
        <div className="product-card__content">
          <h3 className="product-card__title">{product.name}</h3>
          {product.description && <p className="product-card__desc">{product.description}</p>}
          <div className="product-card__meta">
            {hasVariants ? "Можно выбрать размер и цену" : "Один вариант подачи"}
          </div>
        </div>
        <div className="product-card__bottom">
          <div className="product-card__price-block">
            <span className="product-card__price-caption">Стоимость</span>
            <span className="product-card__price">
              {hasVariants ? `от ${product.minPrice} руб.` : `${product.minPrice} руб.`}
            </span>
          </div>
          <button className="btn btn--outline product-card__button" type="button" onClick={onClick}>
            Выбрать
          </button>
        </div>
      </div>
    </article>
  );
};
