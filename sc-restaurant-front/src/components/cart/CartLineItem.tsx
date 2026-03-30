import React from "react";
import { QuantityControl } from "../QuantityControl";
import type { CartItem } from "../../types";

interface Props {
  item: CartItem;
  onChangeQuantity: (productSizeId: number, quantity: number) => void;
  onRemove: (productSizeId: number) => void;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

function buildSizeText(item: CartItem) {
  if (item.sizeLabel) return item.sizeLabel;
  if (item.sizeAmount !== null && item.sizeAmount !== undefined) {
    return `${item.sizeAmount}${item.sizeUnit ? ` ${item.sizeUnit}` : ""}`;
  }
  return null;
}

export const CartLineItem: React.FC<Props> = ({
  item,
  onChangeQuantity,
  onRemove,
}) => {
  const sizeText = buildSizeText(item);

  return (
    <article className="cart-page__item">
      <div className="cart-page__item-media">
        <img src={item.imageUrl || "/img/default.png"} alt={item.productName} />
      </div>

      <div className="cart-page__item-main">
        <div className="cart-page__item-copy">
          <h3>{item.productName}</h3>
          {sizeText ? <p>{sizeText}</p> : null}
          <span>{formatPrice(item.price)} за шт.</span>
        </div>

        <div className="cart-page__item-controls">
          <QuantityControl
            value={item.quantity}
            onChange={(nextValue) => onChangeQuantity(item.productSizeId, nextValue)}
          />
        </div>
      </div>

      <div className="cart-page__item-total">{formatPrice(item.price * item.quantity)}</div>

      <button
        type="button"
        className="cart-page__item-remove"
        onClick={() => onRemove(item.productSizeId)}
        aria-label="Удалить позицию"
      >
        Удалить
      </button>
    </article>
  );
};

export default CartLineItem;
