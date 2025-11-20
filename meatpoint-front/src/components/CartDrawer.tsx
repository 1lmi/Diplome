import React, { useState } from "react";
import { useCart } from "../cartContext";
import { QuantityControl } from "./QuantityControl";
import { api } from "../api";
import type { Order } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onTrack?: (orderId: number, phone: string) => void;
}

export const CartDrawer: React.FC<Props> = ({ open, onClose, onTrack }) => {
  const { items, totalPrice, changeQuantity, removeItem, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !items.length || !phone.trim() || loading;

  const handleOrder = async () => {
    if (disabled) return;
    try {
      setLoading(true);
      setError(null);
      const body = {
        customer: {
          name: name || undefined,
          phone: phone.trim(),
          address: address || undefined,
        },
        comment: comment || undefined,
        items: items.map((i) => ({
          product_size_id: i.productSizeId,
          quantity: i.quantity,
        })),
      };
      const res: Order = await api.createOrder(body);
      setSuccessOrder(res);
      clear();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={"cart-drawer" + (open ? " cart-drawer--open" : "")}>
      <div className="cart-drawer__header">
        <h2>Корзина</h2>
        <button className="icon-btn" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="cart-drawer__content">
        {items.length === 0 && !successOrder && (
          <p className="cart-drawer__empty">Добавьте блюда из меню</p>
        )}

        {items.length > 0 && (
          <ul className="cart-list">
            {items.map((item) => (
              <li key={item.productSizeId} className="cart-item">
                <div className="cart-item__info">
                  <div className="cart-item__title">{item.name}</div>
                  <div className="cart-item__price">
                    {item.price * item.quantity} ₽
                  </div>
                </div>
                <div className="cart-item__controls">
                  <QuantityControl
                    value={item.quantity}
                    onChange={(value) =>
                      value <= 0
                        ? removeItem(item.productSizeId)
                        : changeQuantity(item.productSizeId, value)
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {successOrder && (
          <div className="cart-drawer__success">
            Заказ №{successOrder.id} принят! Мы свяжемся, как только курьер выедет.
            {onTrack && (
              <button
                className="link-btn"
                onClick={() => onTrack(successOrder.id, phone.trim())}
              >
                Отследить статус
              </button>
            )}
          </div>
        )}

        {error && <div className="cart-drawer__error">{error}</div>}

        <div className="cart-drawer__form">
          <h3>Ваши контакты</h3>
          <input
            className="input"
            placeholder="Имя (по желанию)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Телефон"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="input"
            placeholder="Адрес"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="Комментарий для кухни или курьера"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      <div className="cart-drawer__footer">
        <div className="cart-drawer__total">
          <span>Итого</span>
          <span>{totalPrice} ₽</span>
        </div>
        <button
          className="btn btn--primary btn--full"
          disabled={disabled}
          onClick={handleOrder}
        >
          {loading ? "Отправляем..." : "Оформить заказ"}
        </button>
      </div>
    </div>
  );
};
