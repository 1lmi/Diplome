import React from "react";
import type { MenuItem } from "../types";

interface Props {
  product: MenuItem;
  onClick: () => void;
  onAdd?: () => void;
}

export const ProductCard: React.FC<Props> = ({ product, onClick, onAdd }) => {
  return (
    <div className="product-card" onClick={onClick}>
      <div className="product-card__image-wrap">
        <img
          className="product-card__image"
          src={product.image_url}
          alt={product.name}
          loading="lazy"
        />
      </div>
      <h3 className="product-card__title">{product.name}</h3>
      {product.description && (
        <p className="product-card__desc">{product.description}</p>
      )}
      <div className="product-card__bottom">
        <span className="product-card__price">{product.price} ₽</span>
        <button
          className="btn btn--outline"
          onClick={(e) => {
            e.stopPropagation();
            onAdd?.();
          }}
        >
          В корзину
        </button>
      </div>
    </div>
  );
};
