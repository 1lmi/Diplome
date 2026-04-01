import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../cartContext";
import type { ProductDisplay } from "../../types";
import CartLineItem from "./CartLineItem";
import OrderSummaryCard from "./OrderSummaryCard";
import UpsellRail from "./UpsellRail";

interface Props {
  products: ProductDisplay[];
  onSelectProduct: (product: ProductDisplay) => void;
}

export const CartPage: React.FC<Props> = ({ products, onSelectProduct }) => {
  const { items, totalPrice, changeQuantity, removeItem, clear } = useCart();
  const navigate = useNavigate();

  const summaryLines = useMemo(
    () =>
      items.map((item) => ({
        id: item.productSizeId,
        name: item.productName,
        meta:
          item.sizeLabel ||
          (item.sizeAmount !== null && item.sizeAmount !== undefined
            ? `${item.sizeAmount}${item.sizeUnit ? ` ${item.sizeUnit}` : ""}`
            : null),
        amount: item.price * item.quantity,
      })),
    [items]
  );

  const upsellProducts = useMemo(() => {
    const cartIds = new Set(items.map((item) => item.productSizeId));
    return [...products]
      .filter((product) => !product.variants.some((variant) => cartIds.has(variant.id)))
      .sort((a, b) => {
        if (a.minPrice !== b.minPrice) {
          return a.minPrice - b.minPrice;
        }
        return a.name.localeCompare(b.name, "ru");
      })
      .slice(0, 6);
  }, [items, products]);

  if (items.length === 0) {
      return (
        <section className="cart-page cart-page--empty">
          <div className="cart-page__content">
            <div className="panel cart-empty-state">
              <p className="eyebrow">Корзина</p>
              <h1>Корзина пуста</h1>
            <p className="muted">
              Добавьте блюда из меню, а затем перейдите к оформлению заказа.
            </p>
            <div className="cart-empty-state__actions">
              <Link className="btn btn--primary" to="/">
                Вернуться в меню
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <div className="cart-page__layout">
        <div className="cart-page__content">
          <div className="cart-page__header">
            <div>
              <p className="eyebrow">Шаг 1</p>
              <h1>Корзина</h1>
            </div>
            <button type="button" className="link-btn cart-page__clear" onClick={clear}>
              Очистить корзину
            </button>
          </div>

          <div className="cart-page__list">
            {items.map((item) => (
              <CartLineItem
                key={item.productSizeId}
                item={item}
                onChangeQuantity={changeQuantity}
                onRemove={removeItem}
              />
            ))}
          </div>

          <UpsellRail products={upsellProducts} onSelectProduct={onSelectProduct} />
        </div>

        <div className="cart-page__side">
          <OrderSummaryCard lines={summaryLines} totalPrice={totalPrice} />
          <div className="cart-page__actions">
            <button
              type="button"
              className="btn btn--primary btn--full"
              onClick={() => navigate("/checkout")}
            >
              Перейти к оформлению
            </button>
            <Link className="btn btn--ghost btn--full" to="/">
              Вернуться в меню
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CartPage;
