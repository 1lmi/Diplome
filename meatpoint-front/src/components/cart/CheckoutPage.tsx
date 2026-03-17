import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../authContext";
import { useCart } from "../../cartContext";
import { saveOrderTracking } from "../../orderTracking";
import type { CheckoutDraft, UserAddress } from "../../types";
import { focusFirstInvalidField } from "../../utils/forms";
import { useToast } from "../../ui/ToastProvider";
import CheckoutAuthGate from "./CheckoutAuthGate";
import OrderSummaryCard from "./OrderSummaryCard";

interface Props {
  onLoginRequest: () => void;
  addresses: UserAddress[];
  addressesLoading: boolean;
}

export const CheckoutPage: React.FC<Props> = ({
  onLoginRequest,
  addresses,
  addressesLoading,
}) => {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const {
    items,
    totalPrice,
    checkoutDraft,
    updateCheckoutDraft,
    clear,
    resetCheckoutDraft,
  } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const defaultAddress = addresses.find((item) => item.is_default) || null;

  useEffect(() => {
    if (!user) return;

    const patch: Partial<CheckoutDraft> = {};
    if (checkoutDraft.guestMode) patch.guestMode = false;
    if (!checkoutDraft.customerName.trim() && user.full_name) {
      patch.customerName = user.full_name;
    }
    if (!checkoutDraft.customerPhone.trim() && user.login) {
      patch.customerPhone = user.login;
    }

    if (Object.keys(patch).length > 0) {
      updateCheckoutDraft(patch);
    }
  }, [
    checkoutDraft.customerName,
    checkoutDraft.customerPhone,
    checkoutDraft.guestMode,
    updateCheckoutDraft,
    user,
  ]);

  useEffect(() => {
    if (!user) return;
    if (checkoutDraft.deliveryMethod !== "delivery") return;
    if (checkoutDraft.address.trim()) return;
    if (!defaultAddress) return;

    updateCheckoutDraft({ address: defaultAddress.address });
  }, [checkoutDraft.address, checkoutDraft.deliveryMethod, defaultAddress, updateCheckoutDraft, user]);

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

  const authGateLocked = !user && !checkoutDraft.guestMode;
  const needsAddress = checkoutDraft.deliveryMethod === "delivery";
  const trimmedName = checkoutDraft.customerName.trim();
  const trimmedPhone = checkoutDraft.customerPhone.trim();
  const trimmedAddress = checkoutDraft.address.trim();

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateCheckout = () => {
    const nextErrors: Record<string, string> = {};
    if (!trimmedName) nextErrors.customerName = "Укажите имя получателя.";
    if (!trimmedPhone) nextErrors.customerPhone = "Укажите номер телефона.";
    if (needsAddress && !trimmedAddress) nextErrors.address = "Укажите адрес доставки.";
    return nextErrors;
  };

  if (items.length === 0) {
    return (
      <section className="checkout-page">
        <div className="panel checkout-page__empty">
          <p className="eyebrow">Шаг 2</p>
          <h1>Оформление недоступно</h1>
          <p className="muted">Сначала добавьте хотя бы одну позицию в корзину.</p>
          <div className="checkout-page__footer">
            <Link className="btn btn--outline" to="/cart">
              Вернуться в корзину
            </Link>
            <Link className="btn btn--primary" to="/">
              В меню
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const handleSubmit = async () => {
    if (submitting) return;

    if (authGateLocked) {
      const message = "Выберите вход или продолжите как гость, чтобы оформить заказ.";
      setError(message);
      pushToast({
        tone: "info",
        title: "Требуется способ оформления",
        description: message,
      });
      return;
    }

    const nextErrors = validateCheckout();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("Заполните обязательные поля перед оформлением заказа.");
      pushToast({
        tone: "error",
        title: "Форма заполнена не полностью",
        description: "Проверьте имя, телефон и адрес доставки.",
      });
      window.setTimeout(() => {
        focusFirstInvalidField(
          [
            nextErrors.customerName ? "#checkout-customer-name" : "",
            nextErrors.customerPhone ? "#checkout-customer-phone" : "",
            nextErrors.address ? "#checkout-address" : "",
          ].filter(Boolean)
        );
      }, 0);
      return;
    }

    setSubmitting(true);
    setError(null);

    const comment = checkoutDraft.comment.trim();
    const deliveryTime = checkoutDraft.deliveryTime.trim();
    const changeValue = checkoutDraft.cashChangeFrom.trim();
    const cashChangeFrom =
      checkoutDraft.paymentMethod === "cash" && changeValue ? Number(changeValue) : undefined;

    try {
      const order = await api.createOrder({
        customer: {
          name: trimmedName || null,
          phone: trimmedPhone,
          address: needsAddress ? trimmedAddress || null : null,
        },
        delivery_method: checkoutDraft.deliveryMethod,
        delivery_time: deliveryTime || null,
        payment_method: checkoutDraft.paymentMethod,
        cash_change_from:
          cashChangeFrom !== undefined && Number.isFinite(cashChangeFrom) ? cashChangeFrom : null,
        do_not_call: checkoutDraft.doNotCall,
        comment: comment || null,
        items: items.map((item) => ({
          product_size_id: item.productSizeId,
          quantity: item.quantity,
        })),
      });

      if (!user) {
        saveOrderTracking(order.id, trimmedPhone);
      }

      clear();
      resetCheckoutDraft();
      navigate(`/checkout/success/${order.id}`);
    } catch (e: any) {
      const message = e?.message || "Не удалось оформить заказ.";
      setError(message);
      pushToast({
        tone: "error",
        title: "Не удалось оформить заказ",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="checkout-page">
      <div className="checkout-page__layout">
        <div className="checkout-page__content">
          <div className="checkout-page__header">
            <p className="eyebrow">Шаг 2</p>
            <h1>Оформление заказа</h1>
            <p className="muted">
              Заполните данные для связи, выберите способ получения и подтвердите заказ.
            </p>
          </div>

          {authGateLocked ? (
            <CheckoutAuthGate
              onLogin={onLoginRequest}
              onContinueAsGuest={() => updateCheckoutDraft({ guestMode: true })}
            />
          ) : null}

          <div className={"checkout-form" + (authGateLocked ? " checkout-form--locked" : "")}>
            <section className="checkout-section">
              <div className="checkout-section__head">
                <h2>Личные данные</h2>
              </div>
              <div className="checkout-grid">
                <label className="field">
                  <span>Имя</span>
                  <input
                    id="checkout-customer-name"
                    className="input"
                    value={checkoutDraft.customerName}
                    aria-invalid={fieldErrors.customerName ? "true" : "false"}
                    disabled={submitting}
                    onChange={(event) => {
                      clearFieldError("customerName");
                      updateCheckoutDraft({ customerName: event.target.value });
                    }}
                  />
                  {fieldErrors.customerName ? (
                    <p className="field-note field-note--error">{fieldErrors.customerName}</p>
                  ) : null}
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input
                    id="checkout-customer-phone"
                    className="input"
                    value={checkoutDraft.customerPhone}
                    aria-invalid={fieldErrors.customerPhone ? "true" : "false"}
                    disabled={submitting}
                    onChange={(event) => {
                      clearFieldError("customerPhone");
                      updateCheckoutDraft({ customerPhone: event.target.value });
                    }}
                  />
                  {fieldErrors.customerPhone ? (
                    <p className="field-note field-note--error">{fieldErrors.customerPhone}</p>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section__head">
                <h2>Доставка</h2>
              </div>
              <div className="checkout-toggle">
                <button
                  type="button"
                  className={
                    "checkout-toggle__btn" +
                    (checkoutDraft.deliveryMethod === "delivery"
                      ? " checkout-toggle__btn--active"
                      : "")
                  }
                  disabled={submitting}
                  onClick={() => updateCheckoutDraft({ deliveryMethod: "delivery" })}
                >
                  Доставка
                </button>
                <button
                  type="button"
                  className={
                    "checkout-toggle__btn" +
                    (checkoutDraft.deliveryMethod === "pickup"
                      ? " checkout-toggle__btn--active"
                      : "")
                  }
                  disabled={submitting}
                  onClick={() => {
                    clearFieldError("address");
                    updateCheckoutDraft({ deliveryMethod: "pickup" });
                  }}
                >
                  Самовывоз
                </button>
              </div>

              <div className="checkout-stack">
                {needsAddress ? (
                  <>
                    {user ? (
                      <div className="checkout-addresses">
                        <div className="checkout-addresses__head">
                          <span>Сохранённые адреса</span>
                          {addressesLoading ? <small>Обновляем...</small> : null}
                        </div>
                        {addresses.length > 0 ? (
                          <div className="checkout-addresses__list">
                            {addresses.map((address) => {
                              const active = checkoutDraft.address.trim() === address.address.trim();
                              return (
                                <button
                                  key={address.id}
                                  type="button"
                                  className={
                                    "checkout-address-chip" +
                                    (active ? " checkout-address-chip--active" : "")
                                  }
                                  disabled={submitting}
                                  onClick={() => {
                                    clearFieldError("address");
                                    updateCheckoutDraft({ address: address.address });
                                  }}
                                >
                                  <strong>{address.label || "Адрес"}</strong>
                                  <span>{address.address}</span>
                                  {address.is_default ? <em>Основной</em> : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="checkout-hint">
                            Сохранённых адресов пока нет. Добавить их можно в личном кабинете.
                          </div>
                        )}
                      </div>
                    ) : null}

                    <label className="field">
                      <span>Адрес доставки</span>
                      <input
                        id="checkout-address"
                        className="input"
                        value={checkoutDraft.address}
                        aria-invalid={fieldErrors.address ? "true" : "false"}
                        disabled={submitting}
                        onChange={(event) => {
                          clearFieldError("address");
                          updateCheckoutDraft({ address: event.target.value });
                        }}
                      />
                      {fieldErrors.address ? (
                        <p className="field-note field-note--error">{fieldErrors.address}</p>
                      ) : null}
                    </label>
                  </>
                ) : (
                  <div className="checkout-hint">
                    Адрес не требуется. Заказ можно забрать самостоятельно.
                  </div>
                )}

                <label className="field">
                  <span>
                    {checkoutDraft.deliveryMethod === "delivery"
                      ? "Время доставки"
                      : "Время самовывоза"}
                  </span>
                  <input
                    className="input"
                    placeholder="Например, к 19:30"
                    value={checkoutDraft.deliveryTime}
                    disabled={submitting}
                    onChange={(event) =>
                      updateCheckoutDraft({ deliveryTime: event.target.value })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section__head">
                <h2>Комментарий</h2>
                <span>{checkoutDraft.comment.length}/300</span>
              </div>
              <textarea
                className="textarea"
                value={checkoutDraft.comment}
                maxLength={300}
                disabled={submitting}
                placeholder="Укажите важную информацию для кухни или курьера"
                onChange={(event) =>
                  updateCheckoutDraft({ comment: event.target.value.slice(0, 300) })
                }
              />
            </section>

            <section className="checkout-section">
              <div className="checkout-section__head">
                <h2>Оплата</h2>
              </div>
              <div className="checkout-toggle">
                <button
                  type="button"
                  className={
                    "checkout-toggle__btn" +
                    (checkoutDraft.paymentMethod === "cash"
                      ? " checkout-toggle__btn--active"
                      : "")
                  }
                  disabled={submitting}
                  onClick={() => updateCheckoutDraft({ paymentMethod: "cash" })}
                >
                  Наличными
                </button>
                <button
                  type="button"
                  className={
                    "checkout-toggle__btn" +
                    (checkoutDraft.paymentMethod === "card"
                      ? " checkout-toggle__btn--active"
                      : "")
                  }
                  disabled={submitting}
                  onClick={() =>
                    updateCheckoutDraft({
                      paymentMethod: "card",
                      cashChangeFrom: "",
                    })
                  }
                >
                  Картой
                </button>
              </div>

              {checkoutDraft.paymentMethod === "cash" ? (
                <label className="field">
                  <span>Подготовить сдачу с</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={checkoutDraft.cashChangeFrom}
                    disabled={submitting}
                    onChange={(event) =>
                      updateCheckoutDraft({
                        cashChangeFrom: event.target.value.replace(/[^\d]/g, ""),
                      })
                    }
                  />
                </label>
              ) : null}

              <label className="checkbox checkout-checkbox">
                <input
                  type="checkbox"
                  checked={checkoutDraft.doNotCall}
                  disabled={submitting}
                  onChange={(event) =>
                    updateCheckoutDraft({ doNotCall: event.target.checked })
                  }
                />
                <span>
                  Не перезванивать
                  <small>Перезвоним только если потребуется уточнение.</small>
                </span>
              </label>
            </section>
          </div>

          <div className="checkout-page__footer">
            <Link className="btn btn--ghost" to="/cart">
              Вернуться в корзину
            </Link>
            <div className="checkout-page__submit">
              {error ? <div className="alert alert--error">{error}</div> : null}
              <button
                type="button"
                className={"btn btn--primary" + (submitting ? " btn--loading" : "")}
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <span className="btn__spinner" />
                    Отправляем заказ
                  </>
                ) : (
                  "Оформить заказ"
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="checkout-page__side">
          <OrderSummaryCard lines={summaryLines} totalPrice={totalPrice} />
        </div>
      </div>
    </section>
  );
};

export default CheckoutPage;
