import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../../api";
import { useAuth } from "../../authContext";
import { getUnavailableCartItems } from "../../cartAvailability";
import { useCart } from "../../cartContext";
import { saveOrderTracking } from "../../orderTracking";
import type { CheckoutDraft, ProductDisplay, UserAddress } from "../../types";
import { focusFirstInvalidField } from "../../utils/forms";
import { useToast } from "../../ui/ToastProvider";
import AddressFlowModal from "../AddressFlowModal";
import CheckoutAuthGate from "./CheckoutAuthGate";
import OrderSummaryCard from "./OrderSummaryCard";

interface Props {
  onLoginRequest: () => void;
  products: ProductDisplay[];
  availabilityReady: boolean;
  addresses: UserAddress[];
  addressesLoading: boolean;
  onRefreshAddresses: () => Promise<void>;
}

const ASAP_LABEL = "Как можно быстрее";

type TimeOption = {
  value: string;
  label: string;
  startMinutes: number;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function floorToQuarter(date: Date) {
  const quarter = 15 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / quarter) * quarter);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildDailyTimeOptions(baseDate = new Date()): TimeOption[] {
  const slots: TimeOption[] = [];

  for (let hour = 9; hour < 22; hour += 1) {
    for (let minutes = 0; minutes < 60; minutes += 15) {
      const start = new Date(baseDate);
      start.setHours(hour, minutes, 0, 0);
      const end = addMinutes(start, 15);
      if (end.getHours() > 22 || (end.getHours() === 22 && end.getMinutes() > 0)) {
        continue;
      }

      const startMinutes = hour * 60 + minutes;
      const label = `${formatTime(start)}–${formatTime(end)}`;
      slots.push({
        value: label,
        label,
        startMinutes,
      });
    }
  }

  return slots;
}

function buildQuickTimeOptions(allOptions: TimeOption[], baseDate = new Date()): TimeOption[] {
  const threshold = addMinutes(baseDate, 45);
  const thresholdRounded = floorToQuarter(threshold);
  const thresholdMinutes =
    thresholdRounded.getHours() * 60 + thresholdRounded.getMinutes();

  return allOptions.filter((option) => option.startMinutes >= thresholdMinutes).slice(0, 4);
}

function buildOtherTimeOptions(
  allOptions: TimeOption[],
  quickOptions: TimeOption[],
  baseDate = new Date()
) {
  const threshold = addMinutes(baseDate, 45);
  const thresholdRounded = floorToQuarter(threshold);
  const thresholdMinutes =
    thresholdRounded.getHours() * 60 + thresholdRounded.getMinutes();
  const quickValues = new Set(quickOptions.map((option) => option.value));

  return allOptions.filter(
    (option) => option.startMinutes >= thresholdMinutes && !quickValues.has(option.value)
  );
}

export const CheckoutPage: React.FC<Props> = ({
  onLoginRequest,
  products,
  availabilityReady,
  addresses,
  addressesLoading,
  onRefreshAddresses,
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
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressModalSaving, setAddressModalSaving] = useState(false);
  const [allTimesOpen, setAllTimesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const defaultAddress = addresses.find((item) => item.is_default) || null;
  const allTimeOptions = useMemo(() => buildDailyTimeOptions(), []);
  const quickTimeOptions = useMemo(() => buildQuickTimeOptions(allTimeOptions), [allTimeOptions]);
  const otherTimeOptions = useMemo(
    () => buildOtherTimeOptions(allTimeOptions, quickTimeOptions),
    [allTimeOptions, quickTimeOptions]
  );

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

  useEffect(() => {
    const current = checkoutDraft.deliveryTime.trim();
    const hasCurrentOption =
      current === ASAP_LABEL ||
      quickTimeOptions.some((option) => option.value === current) ||
      otherTimeOptions.some((option) => option.value === current);

    if (!current || !hasCurrentOption) {
      updateCheckoutDraft({ deliveryTime: ASAP_LABEL });
    }
  }, [checkoutDraft.deliveryTime, otherTimeOptions, quickTimeOptions, updateCheckoutDraft]);

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

  const authGateLocked = !user && !checkoutDraft.guestMode;
  const needsAddress = checkoutDraft.deliveryMethod === "delivery";
  const trimmedName = checkoutDraft.customerName.trim();
  const trimmedPhone = checkoutDraft.customerPhone.trim();
  const trimmedAddress = checkoutDraft.address.trim();
  const resolvedName = (user?.full_name || trimmedName).trim();
  const resolvedPhone = (user?.login || trimmedPhone).trim();
  const activeSavedAddress =
    addresses.find((item) => item.address.trim() === trimmedAddress) || null;
  const selectedCustomTime = useMemo(() => {
    const current = checkoutDraft.deliveryTime.trim();
    if (!current || current === ASAP_LABEL) return "";
    if (quickTimeOptions.some((option) => option.value === current)) return "";
    return current;
  }, [checkoutDraft.deliveryTime, quickTimeOptions]);

  const availabilityMessage = !availabilityReady
    ? "Проверяем актуальность корзины..."
    : hasUnavailableItems
      ? "В корзине есть недоступные товары. Вернитесь в корзину и удалите их, чтобы оформить заказ."
      : "";

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
    if (needsAddress && !trimmedAddress) nextErrors.address = "Выберите адрес доставки.";
    return nextErrors;
  };

  const handleAddressSave = async (payload: {
    label: string | null;
    address: string;
    isDefault: boolean;
  }) => {
    setAddressModalSaving(true);
    setError(null);

    try {
      if (user) {
        await api.createAddress({
          label: payload.label,
          address: payload.address,
          is_default: payload.isDefault,
        });
        await onRefreshAddresses();
      }

      clearFieldError("address");
      updateCheckoutDraft({
        deliveryMethod: "delivery",
        address: payload.address,
      });
      setAddressModalOpen(false);
      pushToast({
        tone: "success",
        title: user ? "Адрес сохранён" : "Адрес выбран",
        description: user
          ? "Адрес добавлен в профиль и подставлен в заказ."
          : "Адрес подставлен в оформление заказа.",
      });
    } catch (saveError) {
      const message =
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Не удалось сохранить адрес.";
      setError(message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить адрес",
        description: message,
      });
    } finally {
      setAddressModalSaving(false);
    }
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

    if (!availabilityReady) {
      setError("Проверяем актуальность корзины. Попробуйте ещё раз через пару секунд.");
      return;
    }

    if (hasUnavailableItems) {
      const message =
        "В корзине есть недоступные товары. Вернитесь в корзину и удалите их, чтобы оформить заказ.";
      setError(message);
      pushToast({
        tone: "error",
        title: "В корзине есть недоступные товары",
        description: "Удалите их из корзины и повторите оформление.",
      });
      return;
    }

    if (authGateLocked) {
      const message = "Выберите вход или продолжите как гость, чтобы оформить заказ.";
      setError(message);
      pushToast({
        tone: "info",
        title: "Выберите способ оформления",
        description: message,
      });
      return;
    }

    const nextErrors = validateCheckout();
    if (user) {
      delete nextErrors.customerName;
      delete nextErrors.customerPhone;
    }
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
          name: resolvedName || null,
          phone: resolvedPhone,
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
        saveOrderTracking(order.id, resolvedPhone);
      }

      clear();
      resetCheckoutDraft();
      navigate(`/orders/${order.id}`);
    } catch (submitError: unknown) {
      const message =
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Не удалось оформить заказ.";
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
          </div>

          {authGateLocked ? (
            <CheckoutAuthGate
              onLogin={onLoginRequest}
              onContinueAsGuest={() => updateCheckoutDraft({ guestMode: true })}
            />
          ) : null}

          <div className={"checkout-form" + (authGateLocked ? " checkout-form--locked" : "")}>
            {availabilityMessage ? <div className="alert alert--error">{availabilityMessage}</div> : null}
            {!user ? (
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
            ) : null}

            <section className="checkout-section">
              <div className="checkout-section__head">
                <h2>Получение</h2>
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
                    <div className="checkout-addresses">
                      <div className="checkout-addresses__head">
                        <span>{user ? "Сохранённые адреса" : "Адрес доставки"}</span>
                        <div className="checkout-addresses__head-actions">
                          {addressesLoading && user ? <small>Обновляем...</small> : null}
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => setAddressModalOpen(true)}
                            disabled={submitting}
                          >
                            Добавить адрес
                          </button>
                        </div>
                      </div>

                      {user && addresses.length > 0 ? (
                        <div className="checkout-addresses__list">
                          {addresses.map((address) => {
                            const active = trimmedAddress === address.address.trim();
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
                          {user
                            ? "Сохранённых адресов пока нет."
                            : "Выберите адрес на карте. Его можно уточнить и использовать сразу в заказе."}
                        </div>
                      )}
                    </div>

                    {!activeSavedAddress ? (
                      <div className="checkout-selected-address">
                        {trimmedAddress ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setAddressModalOpen(true)}
                            disabled={submitting}
                          >
                            Изменить
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {fieldErrors.address ? (
                      <p className="field-note field-note--error">{fieldErrors.address}</p>
                    ) : null}
                  </>
                ) : (
                  <div className="checkout-hint">
                    Адрес не требуется. Заказ можно забрать самостоятельно.
                  </div>
                )}

                <div className="field">
                  <span>
                    {checkoutDraft.deliveryMethod === "delivery"
                      ? "Время доставки"
                      : "Время самовывоза"}
                  </span>

                  <div className="checkout-time-grid">
                    <button
                      type="button"
                      className={
                        "checkout-time-chip" +
                        (checkoutDraft.deliveryTime === ASAP_LABEL
                          ? " checkout-time-chip--active"
                          : "")
                      }
                      disabled={submitting}
                      onClick={() => {
                        setAllTimesOpen(false);
                        updateCheckoutDraft({ deliveryTime: ASAP_LABEL });
                      }}
                    >
                      {ASAP_LABEL}
                    </button>

                    {quickTimeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          "checkout-time-chip" +
                          (checkoutDraft.deliveryTime === option.value
                            ? " checkout-time-chip--active"
                            : "")
                        }
                        disabled={submitting}
                        onClick={() => {
                          setAllTimesOpen(false);
                          updateCheckoutDraft({ deliveryTime: option.value });
                        }}
                      >
                        {option.label}
                      </button>
                    ))}

                    <button
                      type="button"
                      className={
                        "checkout-time-chip" +
                        (selectedCustomTime ? " checkout-time-chip--active" : "")
                      }
                      disabled={submitting}
                      onClick={() => setAllTimesOpen((prev) => !prev)}
                    >
                      Другое
                    </button>
                  </div>

                  {selectedCustomTime ? (
                    <p className="field-note">Выбрано: {selectedCustomTime}</p>
                  ) : null}

                  {allTimesOpen ? (
                    <div className="checkout-time-sheet">
                      <div className="checkout-time-sheet__head">
                        <strong>Все доступные слоты на сегодня</strong>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setAllTimesOpen(false)}
                        >
                          Закрыть
                        </button>
                      </div>

                      {otherTimeOptions.length ? (
                        <div className="checkout-time-sheet__list">
                          {otherTimeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={
                                "checkout-time-sheet__option" +
                                (checkoutDraft.deliveryTime === option.value
                                  ? " checkout-time-sheet__option--active"
                                  : "")
                              }
                              disabled={submitting}
                              onClick={() => {
                                setAllTimesOpen(false);
                                updateCheckoutDraft({ deliveryTime: option.value });
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="field-note">На сегодня дополнительных слотов больше нет.</p>
                      )}
                    </div>
                  ) : null}
                </div>
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
                disabled={submitting || !availabilityReady || hasUnavailableItems}
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

      {addressModalOpen ? (
        <AddressFlowModal
          title="Адрес доставки"
          initialAddress={trimmedAddress || undefined}
          initialLabel={activeSavedAddress?.label}
          initialIsDefault={activeSavedAddress?.is_default ?? !addresses.length}
          showDefaultToggle={Boolean(user)}
          saveLabel={user ? "Сохранить адрес" : "Использовать адрес"}
          submitting={addressModalSaving}
          onClose={() => setAddressModalOpen(false)}
          onSubmit={handleAddressSave}
        />
      ) : null}
    </section>
  );
};

export default CheckoutPage;
