import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { AdminOrder, SettingsMap } from "../../types";
import { formatTime, isSameDay, terminalStatuses } from "./utils";

interface Props {
  orders: AdminOrder[];
  settings: SettingsMap;
  onSettingChange: (key: string, value: string) => void;
  onSaveSettings: () => void;
  onRefresh: () => void;
  saving: boolean;
}

const formatMoney = (value: number) => new Intl.NumberFormat("ru-RU").format(value);

const SummaryCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  accent?: string;
}> = ({ title, value, subtitle, accent }) => {
  const style = {
    "--summary-accent": accent ?? "var(--accent)",
  } as React.CSSProperties;

  return (
    <div className="summary-card" style={style}>
      <div className="summary-card__title">{title}</div>
      <div className="summary-card__value">{value}</div>
      {subtitle && <div className="summary-card__meta">{subtitle}</div>}
    </div>
  );
};

const getDeliveryMethod = (order: AdminOrder) => {
  if (order.delivery_method === "delivery" || order.delivery_method === "pickup") {
    return order.delivery_method;
  }
  return (order.customer_address ?? "").trim() ? "delivery" : "pickup";
};

const AdminDashboard: React.FC<Props> = ({
  orders,
  settings,
  onSettingChange,
  onSaveSettings,
  onRefresh,
  saving,
}) => {
  const todayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((order) => isSameDay(new Date(order.created_at), today));
  }, [orders]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !terminalStatuses.has(order.status.toLowerCase())),
    [orders]
  );

  const revenueToday = useMemo(
    () => todayOrders.reduce((sum, order) => sum + order.total_price, 0),
    [todayOrders]
  );

  const avgToday = todayOrders.length ? Math.round(revenueToday / todayOrders.length) : 0;

  const activeList = useMemo(
    () =>
      [...activeOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [activeOrders]
  );

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Дашборд</p>
          <h2 className="admin-page__title">Обзор админки</h2>
          <p className="muted">
            Короткая сводка по заказам, быстрые переходы и настройки витрины.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить данные
        </button>
      </div>

      <div className="dashboard-summary">
        <SummaryCard
          title="Активные заказы"
          value={String(activeOrders.length)}
          subtitle="В работе прямо сейчас"
          accent="#ff6b3d"
        />
        <SummaryCard
          title="Заказы сегодня"
          value={String(todayOrders.length)}
          subtitle="Количество за текущий день"
          accent="#1c7ed6"
        />
        <SummaryCard
          title="Выручка сегодня"
          value={`${formatMoney(revenueToday)} ₽`}
          subtitle="Сумма чеков за сегодня"
          accent="#2f9e44"
        />
        <SummaryCard
          title="Средний чек"
          value={avgToday ? `${formatMoney(avgToday)} ₽` : "-"}
          subtitle="По сегодняшним заказам"
          accent="#845ef7"
        />
      </div>

      <div className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div>
            <h3 className="dashboard-panel__title">Быстрые разделы</h3>
            <p className="dashboard-panel__meta">
              Переходите к аналитике, активным заказам или истории без лишних кликов.
            </p>
          </div>
        </div>
        <div className="admin-quick-links">
          <Link className="btn btn--outline" to="/admin/stats">
            Открыть статистику
          </Link>
          <Link className="btn btn--outline" to="/admin/orders/current">
            Текущие заказы
          </Link>
          <Link className="btn btn--outline" to="/admin/orders/history">
            История заказов
          </Link>
        </div>
      </div>

      <div className="dashboard-panel dashboard-panel--accent">
        <div className="dashboard-panel__header">
          <div>
            <h3 className="dashboard-panel__title">Заказы в работе</h3>
            <p className="dashboard-panel__meta">Последние активные заказы для быстрого контроля.</p>
          </div>
        </div>
        {activeList.length === 0 && <div className="muted">Активных заказов нет.</div>}
        {activeList.length > 0 && (
          <div className="active-strip">
            {activeList.map((order) => {
              const items = order.items ?? [];
              const deliveryLabel =
                getDeliveryMethod(order) === "delivery" ? "Доставка" : "Самовывоз";

              return (
                <div key={order.id} className="order-mini-card">
                  <div className="order-mini-card__head">
                    <span className="order-mini-card__type">{deliveryLabel}</span>
                    <span className="order-mini-card__id">№{order.id}</span>
                  </div>
                  <div className="order-mini-card__sum">{formatMoney(order.total_price)} ₽</div>
                  {items.length === 0 ? (
                    <div className="order-mini-card__empty muted">Нет позиций</div>
                  ) : (
                    <div className="order-mini-card__items">
                      {items.slice(0, 3).map((item) => (
                        <div
                          key={`${order.id}-${item.product_size_id}-${item.product_name}`}
                          className="order-mini-card__thumb"
                        >
                          <img src={item.image_url || "/static/default.png"} alt={item.product_name} />
                        </div>
                      ))}
                      {items.length > 3 && <div className="order-mini-card__more">+{items.length - 3}</div>}
                    </div>
                  )}
                  <div className="order-mini-card__meta">
                    <span className="order-mini-card__count">{items.length} поз.</span>
                    <span>{formatTime(order.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel dashboard-settings">
        <div className="panel__header">
          <div>
            <h3>Настройки витрины</h3>
            <p className="muted">Тексты главного блока на сайте и контактный номер.</p>
          </div>
          <button className="btn btn--primary" onClick={onSaveSettings} disabled={saving}>
            Сохранить
          </button>
        </div>
        <div className="stack gap-8">
          <label className="field">
            <span>Заголовок</span>
            <input
              className="input"
              value={settings.hero_title || ""}
              onChange={(e) => onSettingChange("hero_title", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Подзаголовок</span>
            <input
              className="input"
              value={settings.hero_subtitle || ""}
              onChange={(e) => onSettingChange("hero_subtitle", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input
              className="input"
              value={settings.contact_phone || ""}
              onChange={(e) => onSettingChange("contact_phone", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Подсказка о доставке</span>
            <input
              className="input"
              value={settings.delivery_hint || ""}
              onChange={(e) => onSettingChange("delivery_hint", e.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
