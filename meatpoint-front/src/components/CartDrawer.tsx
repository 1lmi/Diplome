import React, { useEffect, useState } from "react";
import { useCart } from "../cartContext";
import { QuantityControl } from "./QuantityControl";
import { api } from "../api";
import type { Order } from "../types";
import { useAuth } from "../authContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onTrack?: (orderId: number, phone: string) => void;
}

export const CartDrawer: React.FC<Props> = ({ open, onClose, onTrack }) => {
  const { items, totalPrice, changeQuantity, removeItem, clear } = useCart();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (user?.login) {
      setPhone(user.login);
    }
    if (user?.full_name) {
      setName(user.full_name);
    }
    if (open) {
      setClosing(false);
      setError(null);
    }
  }, [user, open]);

  const visible = open || closing;
  const disabled = !items.length || !phone.trim() || loading || !user;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 180);
  };

  const handleOrder = async () => {
    if (!user) {
      setError("Авторизуйтесь, чтобы оформить заказ.");
      return;
    }
    if (disabled) return;
    try {
      setLoading(true);
      setError(null);
      const body = {
        customer: {
          name: name || user.full_name || undefined,
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

  if (!visible) return null;

  return (
    <div
      className="modal-backdrop"
      data-leave={closing ? "true" : undefined}
      onClick={handleClose}
    >
      <div
        className="modal cart-modal"
        data-leave={closing ? "true" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose}>
          ×
        </button>

        <div className="cart-modal__content">
          <div className="cart-modal__items">
            <h2>Корзина</h2>
            {items.length === 0 && !successOrder && (
              <p className="cart-modal__empty">Добавьте блюда из меню.</p>
            )}

            {items.length > 0 && (
              <ul className="cart-list">
                {items.map((item) => (
                  <li key={item.productSizeId} className="cart-item">
                    <div className="cart-item__info">
                      <div className="cart-item__title">{item.name}</div>
                      <div className="cart-item__price">
                        {item.price * item.quantity} руб.
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
              <div className="cart-modal__success">
                Заказ №{successOrder.id} оформлен! Мы скоро свяжемся.
                {onTrack && (
                  <button
                    className="link-btn"
                    onClick={() => onTrack(successOrder.id, phone.trim())}
                  >
                    Смотреть статус
                  </button>
                )}
              </div>
            )}

            {error && <div className="cart-modal__error">{error}</div>}
          </div>

          <div className="cart-modal__sidebar">
            <div className="cart-modal__summary">
              <div className="cart-modal__row">
                <span>Итого</span>
                <span>{totalPrice} руб.</span>
              </div>
            </div>

            <div className="cart-modal__form">
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
                placeholder="Комментарий для курьера"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {!user && (
                <div className="alert">
                  Войдите или зарегистрируйтесь, чтобы оформить заказ.
                </div>
              )}
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
      </div>
    </div>
  );
};
