import React from "react";
import type { MenuItem } from "../types";

interface Props {
  product: MenuItem;
  onClick: () => void;
}

export const ProductCard: React.FC<Props> = ({ product, onClick }) => {
  return (
    <div className="product-card" onClick={onClick}>
      <div className="product-card__image-wrap">
        <div className="product-card__image" />
      </div>
      <h3 className="product-card__title">{product.name}</h3>
      {product.description && (
        <p className="product-card__desc">{product.description}</p>
      )}
      <div className="product-card__bottom">
        <span className="product-card__price">от {product.price} ₽</span>
        <button className="btn btn--outline">Выбрать</button>
      </div>
    </div>
  );
};
