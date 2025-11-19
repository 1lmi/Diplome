import React, { useState } from "react";
import { useCart } from "../cartContext";
import { QuantityControl } from "./QuantityControl";
import { api } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CartDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { items, totalPrice, changeQuantity, removeItem, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState<number | null>(null);
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
      const res: any = await api.createOrder(body);
      setSuccessId(res.id);
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
        {items.length === 0 && !successId && (
          <p className="cart-drawer__empty">Корзина пуста 🙂</p>
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

        {successId && (
          <div className="cart-drawer__success">
            Заказ №{successId} успешно создан!
          </div>
        )}

        {error && <div className="cart-drawer__error">{error}</div>}

        <div className="cart-drawer__form">
          <h3>Данные для доставки</h3>
          <input
            className="input"
            placeholder="Имя (необязательно)"
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
            placeholder="Комментарий к заказу"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      <div className="cart-drawer__footer">
        <div className="cart-drawer__total">
          <span>Сумма заказа</span>
          <span>{totalPrice} ₽</span>
        </div>
        <button
          className="btn btn--primary btn--full"
          disabled={disabled}
          onClick={handleOrder}
        >
          {loading ? "Оформляем..." : "К оформлению заказа"}
        </button>
      </div>
    </div>
  );
};
