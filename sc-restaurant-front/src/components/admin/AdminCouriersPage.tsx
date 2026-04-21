import React, { useEffect, useMemo, useState } from "react";

import type { AdminCourier } from "../../types";

interface Props {
  couriers: AdminCourier[];
  onCreateCourier: (payload: {
    display_name: string;
    phone: string;
    password: string;
    is_active: boolean;
    notes?: string | null;
  }) => Promise<void>;
  onUpdateCourier: (
    courierId: number,
    payload: {
      display_name?: string;
      phone?: string;
      password?: string;
      is_active?: boolean;
      notes?: string | null;
    }
  ) => Promise<void>;
  onRefresh: () => void;
  saving: boolean;
}

type DraftMap = Record<
  number,
  {
    display_name: string;
    phone: string;
    password: string;
    is_active: boolean;
    notes: string;
  }
>;

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AdminCouriersPage: React.FC<Props> = ({
  couriers,
  onCreateCourier,
  onUpdateCourier,
  onRefresh,
  saving,
}) => {
  const [createForm, setCreateForm] = useState({
    display_name: "",
    phone: "",
    password: "",
    is_active: true,
    notes: "",
  });
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [busyCourierId, setBusyCourierId] = useState<number | null>(null);

  useEffect(() => {
    const nextDrafts: DraftMap = {};
    couriers.forEach((courier) => {
      nextDrafts[courier.id] = {
        display_name: courier.display_name,
        phone: courier.phone || courier.login,
        password: "",
        is_active: courier.is_active,
        notes: courier.notes || "",
      };
    });
    setDrafts(nextDrafts);
  }, [couriers]);

  const activeCouriers = useMemo(
    () => couriers.filter((courier) => courier.is_active).length,
    [couriers]
  );

  const handleCreate = async () => {
    try {
      await onCreateCourier({
        display_name: createForm.display_name,
        phone: createForm.phone,
        password: createForm.password,
        is_active: createForm.is_active,
        notes: createForm.notes.trim() || null,
      });
      setCreateForm({
        display_name: "",
        phone: "",
        password: "",
        is_active: true,
        notes: "",
      });
    } catch {
      // Parent handles the error surface.
    }
  };

  const handleSave = async (courierId: number) => {
    const draft = drafts[courierId];
    if (!draft) return;
    setBusyCourierId(courierId);
    try {
      await onUpdateCourier(courierId, {
        display_name: draft.display_name,
        phone: draft.phone,
        password: draft.password.trim() || undefined,
        is_active: draft.is_active,
        notes: draft.notes.trim() || null,
      });
      setDrafts((prev) => ({
        ...prev,
        [courierId]: {
          ...prev[courierId],
          password: "",
        },
      }));
    } catch {
      // Parent handles the error surface.
    } finally {
      setBusyCourierId(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Операции</p>
          <h2 className="admin-page__title">Курьеры</h2>
          <p className="muted">
            Здесь администратор выпускает логины и пароли для courier app и может отключать доступ.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      <div className="dashboard-summary">
        <div className="summary-card">
          <div className="summary-card__title">Всего курьеров</div>
          <div className="summary-card__value">{couriers.length}</div>
          <div className="summary-card__meta">Создано в системе</div>
        </div>
        <div className="summary-card">
          <div className="summary-card__title">Активных</div>
          <div className="summary-card__value">{activeCouriers}</div>
          <div className="summary-card__meta">Могут войти в courier app</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h3>Новый курьер</h3>
            <p className="muted">Номер телефона используется как логин.</p>
          </div>
        </div>
        <div className="stack gap-8">
          <label className="field">
            <span>Имя</span>
            <input
              className="input"
              value={createForm.display_name}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, display_name: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Телефон / логин</span>
            <input
              className="input"
              placeholder="+7..."
              value={createForm.phone}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              className="input"
              type="password"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, password: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Заметка</span>
            <textarea
              className="input"
              rows={3}
              value={createForm.notes}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))
              }
            />
            <span>Доступ активен сразу после создания</span>
          </label>
          <div>
            <button className="btn btn--primary" onClick={() => void handleCreate()} disabled={saving}>
              Создать курьера
            </button>
          </div>
        </div>
      </div>

      <div className="stack gap-8">
        {couriers.map((courier) => {
          const draft = drafts[courier.id];
          if (!draft) return null;
          const busy = saving && busyCourierId === courier.id;

          return (
            <div key={courier.id} className="panel">
              <div className="panel__header">
                <div>
                  <h3>{courier.display_name}</h3>
                  <p className="muted">
                    {courier.active_order_id
                      ? `Сейчас ведёт заказ №${courier.active_order_id} (${courier.active_order_status_name || courier.active_order_status})`
                      : "Свободен"}
                  </p>
                </div>
                <span className="profile-badge">
                  {courier.is_active ? "Активен" : "Отключён"}
                </span>
              </div>

              <div className="stack gap-8">
                <label className="field">
                  <span>Имя</span>
                  <input
                    className="input"
                    value={draft.display_name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [courier.id]: { ...prev[courier.id], display_name: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Телефон / логин</span>
                  <input
                    className="input"
                    value={draft.phone}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [courier.id]: { ...prev[courier.id], phone: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Новый пароль</span>
                  <input
                    className="input"
                    type="password"
                    placeholder="Оставьте пустым, чтобы не менять"
                    value={draft.password}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [courier.id]: { ...prev[courier.id], password: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Заметка</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={draft.notes}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [courier.id]: { ...prev[courier.id], notes: e.target.value },
                      }))
                    }
                  />
                </label>
                <div className="order-page__details">
                  <div className="order-page__info">
                    <span className="muted">Создан</span>
                    <strong>{formatDateTime(courier.created_at)}</strong>
                  </div>
                  <div className="order-page__info">
                    <span className="muted">Обновлён</span>
                    <strong>{formatDateTime(courier.updated_at)}</strong>
                  </div>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [courier.id]: { ...prev[courier.id], is_active: e.target.checked },
                      }))
                    }
                  />
                  <span>Доступ активен</span>
                </label>
                <div>
                  <button
                    className="btn btn--primary"
                    onClick={() => void handleSave(courier.id)}
                    disabled={busy}
                  >
                    {busy ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminCouriersPage;
