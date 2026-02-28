import React from "react";
import type { ProductDisplay } from "../../types";

interface Props {
  products: ProductDisplay[];
  onSelectProduct: (product: ProductDisplay) => void;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export const UpsellRail: React.FC<Props> = ({ products, onSelectProduct }) => {
  if (products.length === 0) return null;

  return (
    <section className="upsell-rail">
      <div className="upsell-rail__header">
        <h3>Добавить к заказу</h3>
        <p>Ещё несколько позиций, которые можно выбрать перед оформлением.</p>
      </div>

      <div className="upsell-rail__list">
        {products.map((product) => (
          <button
            key={product.key}
            type="button"
            className="upsell-card"
            onClick={() => onSelectProduct(product)}
          >
            <div className="upsell-card__media">
              <img src={product.image_url || "/img/default.png"} alt={product.name} />
            </div>
            <div className="upsell-card__body">
              <span className="upsell-card__title">{product.name}</span>
              <span className="upsell-card__price">{formatPrice(product.minPrice)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default UpsellRail;
