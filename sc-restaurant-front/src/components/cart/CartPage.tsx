import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../authContext";
import { useCart } from "../../cartContext";
import { getUnavailableCartItems } from "../../cartAvailability";
import type { ProductDisplay } from "../../types";
import CartLineItem from "./CartLineItem";
import OrderSummaryCard from "./OrderSummaryCard";
import UpsellRail from "./UpsellRail";

interface Props {
  products: ProductDisplay[];
  availabilityReady: boolean;
  onSelectProduct: (product: ProductDisplay) => void;
}

export const CartPage: React.FC<Props> = ({
  products,
  availabilityReady,
  onSelectProduct,
}) => {
  const { user } = useAuth();
  const { items, totalPrice, changeQuantity, removeItem, clear } = useCart();
  const navigate = useNavigate();

  const unavailableItems = useMemo(
    () => (availabilityReady ? getUnavailableCartItems(items, products) : []),
    [availabilityReady, items, products]
  );

  const unavailableItemIds = useMemo(
    () => new Set(unavailableItems.map((item) => item.productSizeId)),
    [unavailableItems]
  );

  const hasUnavailableItems = unavailableItems.length > 0;

  const summaryLines = useMemo(
    () =>
      items.map((item) => {
        const baseMeta =
          item.sizeLabel ||
          (item.sizeAmount !== null && item.sizeAmount !== undefined
            ? `${item.sizeAmount}${item.sizeUnit ? ` ${item.sizeUnit}` : ""}`
            : null);

        return {
          id: item.productSizeId,
          name: item.productName,
          meta: unavailableItemIds.has(item.productSizeId)
            ? [baseMeta, "Недоступно"].filter(Boolean).join(" • ")
            : baseMeta,
          amount: item.price * item.quantity,
        };
      }),
    [items, unavailableItemIds]
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
              Добавьте блюда из меню, а затем переходите к оформлению заказа.
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
                unavailable={unavailableItemIds.has(item.productSizeId)}
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
              disabled={!availabilityReady || hasUnavailableItems || !user}
              onClick={() => navigate("/checkout")}
            >
              Перейти к оформлению
            </button>
            {!availabilityReady ? (
              <p className="cart-page__availability-note">Проверяем актуальность корзины...</p>
            ) : null}
            {hasUnavailableItems ? (
              <p className="cart-page__availability-note cart-page__availability-note--error">
                Удалите недоступные позиции, чтобы продолжить оформление.
              </p>
            ) : null}
            {!user ? <p className="cart-page__auth-note">Войдите, чтобы оформить заказ</p> : null}
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
