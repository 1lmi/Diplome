import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { useCart } from "../cartContext";
import { formatPhoneInput } from "../phone";
import type { Order, User, UserAddress } from "../types";
import AddressFlowModal from "./AddressFlowModal";

interface Props {
  user: User;
  orders: Order[];
  ordersLoading: boolean;
  addresses: UserAddress[];
  addressesLoading: boolean;
  onRefreshOrders: () => Promise<void>;
  onRefreshAddresses: () => Promise<void>;
  onRefreshUser: () => Promise<void>;
}

interface ProfileFormState {
  firstName: string;
  birthDate: string;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const formatOrderDate = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatBirthDate = (value?: string | null) => {
  if (!value) return "Не указано";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const getDeliveryLabel = (order: Order) =>
  order.delivery_method === "pickup"
    ? "Самовывоз"
    : order.delivery_method === "delivery" || order.customer_address
      ? "Доставка"
      : "Самовывоз";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const createProfileForm = (user: User): ProfileFormState => ({
  firstName: user.first_name || "",
  birthDate: user.birth_date || "",
});

const formatProfilePhone = (value?: string | null) =>
  value ? formatPhoneInput(value) || value : "Не указано";

const ProfilePage: React.FC<Props> = ({
  user,
  orders,
  ordersLoading,
  addresses,
  addressesLoading,
  onRefreshOrders,
  onRefreshAddresses,
  onRefreshUser,
}) => {
  const { checkoutDraft, updateCheckoutDraft } = useCart();
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => createProfileForm(user));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressDeletingId, setAddressDeletingId] = useState<number | null>(null);
  const [addressStatus, setAddressStatus] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  const editingAddress = useMemo(
    () => addresses.find((item) => item.id === editingAddressId) || null,
    [addresses, editingAddressId]
  );

  useEffect(() => {
    setProfileForm(createProfileForm(user));
  }, [user]);

  useEffect(() => {
    if (editingAddressId !== null && !editingAddress) {
      setEditingAddressId(null);
      setAddressModalOpen(false);
    }
  }, [editingAddress, editingAddressId]);

  const profileRows = [
    {
      label: "Номер телефона",
      value: formatProfilePhone(user.login),
      muted: false,
    },
    {
      label: "Имя",
      value: user.first_name || "Не указано",
      muted: !user.first_name,
    },
    {
      label: "Дата рождения",
      value: formatBirthDate(user.birth_date),
      muted: !user.birth_date,
    },
  ];

  const openCreateAddressForm = () => {
    setAddressStatus(null);
    setAddressError(null);
    setEditingAddressId(null);
    setAddressModalOpen(true);
  };

  const openEditAddressForm = (address: UserAddress) => {
    setAddressStatus(null);
    setAddressError(null);
    setEditingAddressId(address.id);
    setAddressModalOpen(true);
  };

  const closeAddressForm = () => {
    setEditingAddressId(null);
    setAddressModalOpen(false);
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileStatus(null);
    setProfileError(null);

    try {
      await api.updateProfile({
        first_name: profileForm.firstName.trim() || null,
        last_name: null,
        birth_date: profileForm.birthDate || null,
        gender: null,
      });
      await onRefreshUser();
      setProfileEditing(false);
      setProfileStatus("Данные сохранены");
    } catch (error) {
      setProfileError(getErrorMessage(error, "Не удалось сохранить данные."));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddressSave = async (payload: {
    label: string | null;
    address: string;
    isDefault: boolean;
  }) => {
    setAddressSaving(true);
    setAddressStatus(null);
    setAddressError(null);

    try {
      const previousAddress = editingAddress?.address.trim() || "";

      if (editingAddressId === null) {
        await api.createAddress({
          label: payload.label,
          address: payload.address,
          is_default: payload.isDefault,
        });
        setAddressStatus("Адрес добавлен");
      } else {
        await api.updateAddress(editingAddressId, {
          label: payload.label,
          address: payload.address,
          is_default: payload.isDefault,
        });
        setAddressStatus("Адрес обновлён");
      }

      await onRefreshAddresses();

      if (previousAddress && checkoutDraft.address.trim() === previousAddress) {
        updateCheckoutDraft({ address: payload.address });
      }

      closeAddressForm();
    } catch (error) {
      setAddressError(getErrorMessage(error, "Не удалось сохранить адрес."));
    } finally {
      setAddressSaving(false);
    }
  };

  const handleMakeDefault = async (addressId: number) => {
    setAddressStatus(null);
    setAddressError(null);
    setAddressSaving(true);

    try {
      await api.updateAddress(addressId, { is_default: true });
      await onRefreshAddresses();
      setAddressStatus("Основной адрес обновлён");
    } catch (error) {
      setAddressError(getErrorMessage(error, "Не удалось обновить основной адрес."));
    } finally {
      setAddressSaving(false);
    }
  };

  const handleDeleteAddress = async (address: UserAddress) => {
    if (!window.confirm(`Удалить адрес "${address.label || address.address}"?`)) {
      return;
    }

    setAddressStatus(null);
    setAddressError(null);
    setAddressDeletingId(address.id);

    try {
      await api.deleteAddress(address.id);
      await onRefreshAddresses();
      setAddressStatus("Адрес удалён");

      if (checkoutDraft.address.trim() === address.address.trim()) {
        updateCheckoutDraft({ address: "" });
      }

      if (editingAddressId === address.id) {
        closeAddressForm();
      }
    } catch (error) {
      setAddressError(getErrorMessage(error, "Не удалось удалить адрес."));
    } finally {
      setAddressDeletingId(null);
    }
  };

  return (
    <section className="profile-page">
      <div className="profile-page__header">
        <p className="eyebrow">Профиль</p>
        <h1>Личный кабинет</h1>
        <p className="muted">
          Управляйте данными аккаунта, храните адреса доставки и быстро возвращайтесь к
          своим заказам.
        </p>
      </div>

      <div className="profile-page__grid">
        <div className="profile-page__sidebar">
          <div className="profile-card profile-card--data profile-section">
            <div className="profile-section__header">
              <div>
                <h3>Личные данные</h3>
                <p className="muted">Контакт для входа и базовая информация для доставки.</p>
              </div>
              {!profileEditing ? (
                <button
                  className="btn btn--outline btn--sm"
                  type="button"
                  onClick={() => {
                    setProfileEditing(true);
                    setProfileStatus(null);
                    setProfileError(null);
                  }}
                >
                  Редактировать
                </button>
              ) : null}
            </div>

            {!profileEditing ? (
              <div className="profile-info-list">
                {profileRows.map((item) => (
                  <div key={item.label} className="profile-info-row">
                    <span className="profile-info-row__label">{item.label}</span>
                    <span
                      className={
                        "profile-info-row__value" + (item.muted ? " profile-info-row__value--muted" : "")
                      }
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-form">
                <label className="profile-form__field">
                  <span className="profile-form__label">Номер телефона</span>
                  <input className="input" value={formatPhoneInput(user.login || "") || ""} disabled />
                </label>

                <label className="profile-form__field">
                  <span className="profile-form__label">Имя</span>
                  <input
                    className="input"
                    value={profileForm.firstName}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))
                    }
                  />
                </label>

                <label className="profile-form__field">
                  <span className="profile-form__label">Дата рождения</span>
                  <input
                    className="input"
                    type="date"
                    value={profileForm.birthDate}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, birthDate: event.target.value }))
                    }
                  />
                </label>

                <div className="profile-form__actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => {
                      setProfileEditing(false);
                      setProfileForm(createProfileForm(user));
                      setProfileStatus(null);
                      setProfileError(null);
                    }}
                    disabled={profileSaving}
                  >
                    Отмена
                  </button>
                  <button
                    className="btn btn--primary btn--sm"
                    type="button"
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}

            {profileStatus ? <div className="alert alert--success">{profileStatus}</div> : null}
            {profileError ? <div className="alert alert--error">{profileError}</div> : null}
          </div>

          <div className="profile-card profile-section">
            <div className="profile-section__header">
              <div>
                <h3>Адреса</h3>
                <p className="muted">Сохраняйте несколько адресов и выбирайте нужный при оформлении.</p>
              </div>
              <button className="btn btn--outline btn--sm" type="button" onClick={openCreateAddressForm}>
                Добавить
              </button>
            </div>

            {addressesLoading ? <div className="muted">Загружаем адреса...</div> : null}

            {!addressesLoading && addresses.length === 0 ? (
              <div className="profile-empty-state">
                <strong>Адресов пока нет</strong>
                <p className="muted">
                  Добавьте основной адрес, чтобы не выбирать его заново при каждом заказе.
                </p>
              </div>
            ) : null}

            {!addressesLoading && addresses.length > 0 ? (
              <div className="address-list">
                {addresses.map((address) => (
                  <article
                    key={address.id}
                    className={"address-card" + (address.is_default ? " address-card--default" : "")}
                  >
                    <div className="address-card__top">
                      <div>
                        <div className="address-card__title">{address.label || "Адрес доставки"}</div>
                        <p className="address-card__value">{address.address}</p>
                      </div>
                      {address.is_default ? (
                        <span className="profile-badge profile-badge--accent">Основной</span>
                      ) : null}
                    </div>

                    <div className="address-card__actions">
                      {!address.is_default ? (
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => void handleMakeDefault(address.id)}
                          disabled={addressSaving}
                        >
                          Сделать основным
                        </button>
                      ) : null}

                      <button
                        className="btn btn--outline btn--sm"
                        type="button"
                        onClick={() => openEditAddressForm(address)}
                      >
                        Изменить
                      </button>

                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => void handleDeleteAddress(address)}
                        disabled={addressDeletingId === address.id}
                      >
                        {addressDeletingId === address.id ? "Удаляем..." : "Удалить"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {addressStatus ? <div className="alert alert--success">{addressStatus}</div> : null}
            {addressError ? <div className="alert alert--error">{addressError}</div> : null}
          </div>
        </div>

        <div className="profile-card profile-card--orders profile-section">
          <div className="profile-section__header">
            <div>
              <h3>История заказов</h3>
              <p className="muted">Все ваши заказы в одном месте, без лишней детализации состава.</p>
            </div>
            <button className="btn btn--outline btn--sm" type="button" onClick={() => void onRefreshOrders()}>
              Обновить
            </button>
          </div>

          {ordersLoading ? <div className="muted">Загружаем заказы...</div> : null}

          {!ordersLoading && orders.length === 0 ? (
            <div className="profile-empty-state">
              <strong>Пока без заказов</strong>
              <p className="muted">Когда оформите первый заказ, он появится здесь.</p>
            </div>
          ) : null}

          {!ordersLoading && orders.length > 0 ? (
            <>
              <div className="profile-orders-table">
                <div className="profile-orders-table__head">
                  <span>№</span>
                  <span>Дата</span>
                  <span>Тип</span>
                  <span>Статус</span>
                  <span>Сумма</span>
                  <span className="align-right">Подробнее</span>
                </div>

                {orders.map((order) => (
                  <div key={order.id} className="profile-orders-table__row">
                    <span className="profile-orders-table__accent">№{order.id}</span>
                    <span>{formatOrderDate(order.created_at)}</span>
                    <span>{getDeliveryLabel(order)}</span>
                    <span>{order.status_name}</span>
                    <span>{formatPrice(order.total_price)}</span>
                    <span className="align-right">
                      <Link className="profile-orders-table__link" to={`/orders/${order.id}`}>
                        Открыть
                      </Link>
                    </span>
                  </div>
                ))}
              </div>

              <div className="profile-orders-mobile">
                {orders.map((order) => (
                  <article key={order.id} className="profile-order-card">
                    <div className="profile-order-card__top">
                      <strong>№{order.id}</strong>
                      <span className="profile-badge">{order.status_name}</span>
                    </div>
                    <div className="profile-order-card__meta">
                      <span>{formatOrderDate(order.created_at)}</span>
                      <span>{getDeliveryLabel(order)}</span>
                    </div>
                    <div className="profile-order-card__bottom">
                      <strong>{formatPrice(order.total_price)}</strong>
                      <Link className="btn btn--outline btn--sm" to={`/orders/${order.id}`}>
                        Подробнее
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {addressModalOpen ? (
        <AddressFlowModal
          title={editingAddressId === null ? "Новый адрес" : "Редактирование адреса"}
          initialAddress={editingAddress?.address}
          initialLabel={editingAddress?.label}
          initialIsDefault={editingAddress?.is_default ?? addresses.length === 0}
          submitting={addressSaving}
          deleting={addressDeletingId === editingAddressId && editingAddressId !== null}
          onClose={closeAddressForm}
          onSubmit={handleAddressSave}
          onDelete={editingAddress ? () => handleDeleteAddress(editingAddress) : undefined}
        />
      ) : null}
    </section>
  );
};

export default ProfilePage;
