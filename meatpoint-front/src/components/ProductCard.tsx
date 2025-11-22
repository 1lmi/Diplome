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
    <div className="product-card" onClick={onClick}>
      <div className="product-card__image-wrap">
        <img
          className="product-card__image"
          src={product.image_url || "/img/default.png"}
          alt={product.name}
          loading="lazy"
        />
      </div>
      <h3 className="product-card__title">{product.name}</h3>
      {product.description && (
        <p className="product-card__desc">{product.description}</p>
      )}
      <div className="product-card__bottom">
        <span className="product-card__price">
          {hasVariants ? `от ${product.minPrice} руб.` : `${product.minPrice} руб.`}
        </span>
        <button className="btn btn--outline">Выбрать</button>
      </div>
    </div>
  );
};
