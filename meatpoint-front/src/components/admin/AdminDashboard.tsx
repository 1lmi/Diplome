import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { AdminOrder, SettingsMap, StatusOption } from "../../types";
import { dayKey, formatTime, isSameDay, terminalStatuses } from "./utils";

interface Props {
  orders: AdminOrder[];
  statuses: StatusOption[];
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

const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string; currency?: boolean }> = ({
  active,
  payload,
  label,
  currency,
}) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      {label && <div className="chart-tooltip__label">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip__row">
          <span>{p.name}</span>
          <strong>{currency ? `${formatMoney(p.value)} ₽` : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const AdminDashboard: React.FC<Props> = ({
  orders,
  settings,
  onSettingChange,
  onSaveSettings,
  onRefresh,
  saving,
}) => {
  const [popularRange, setPopularRange] = useState<"day" | "week">("day");

  const todayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((o) => isSameDay(new Date(o.created_at), today));
  }, [orders]);

  const activeOrders = useMemo(
    () => orders.filter((o) => !terminalStatuses.has(o.status.toLowerCase())),
    [orders]
  );

  const revenueToday = useMemo(
    () => todayOrders.reduce((sum, o) => sum + o.total_price, 0),
    [todayOrders]
  );

  const avgToday = todayOrders.length ? Math.round(revenueToday / todayOrders.length) : 0;

  const getDeliveryMethod = (order: AdminOrder) => {
    if (order.delivery_method === "delivery" || order.delivery_method === "pickup") {
      return order.delivery_method;
    }
    return (order.customer_address ?? "").trim() ? "delivery" : "pickup";
  };

  const deliveryCount = todayOrders.filter((o) => getDeliveryMethod(o) === "delivery").length;
  const pickupCount = Math.max(todayOrders.length - deliveryCount, 0);

  const orderTypeData = [
    { name: "Доставка", value: deliveryCount, color: "#ff8c3a" },
    { name: "Самовывоз", value: pickupCount, color: "#ffd2ad" },
  ];

  const hourlyBuckets = useMemo(() => {
    const startHour = 8;
    const endHour = 23;
    const buckets = Array.from({ length: endHour - startHour + 1 }, (_, idx) => {
      const hour = startHour + idx;
      return { label: String(hour), value: 0 };
    });

    todayOrders.forEach((order) => {
      const hour = new Date(order.created_at).getHours();
      if (hour >= startHour && hour <= endHour) {
        buckets[hour - startHour].value += 1;
      }
    });

    return buckets;
  }, [todayOrders]);

  const dailyStats = useMemo(() => {
    const now = new Date();
    const map: Record<string, { revenue: number; orders: number }> = {};
    orders.forEach((o) => {
      const key = dayKey(new Date(o.created_at));
      map[key] = map[key] ?? { revenue: 0, orders: 0 };
      map[key].revenue += o.total_price;
      map[key].orders += 1;
    });

    const list: { label: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = dayKey(day);
      const label = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(day);
      list.push({ label, revenue: map[key]?.revenue ?? 0, orders: map[key]?.orders ?? 0 });
    }
    return list;
  }, [orders]);

  const popularItems = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const dayMap = new Map<string, number>();
    const weekMap = new Map<string, number>();

    orders.forEach((order) => {
      const created = new Date(order.created_at);
      const items = order.items ?? [];
      const isToday = created >= todayStart;
      const isWeek = created >= weekStart;
      if (!isToday && !isWeek) return;

      items.forEach((item) => {
        const key = item.product_name || "Позиция";
        if (isToday) {
          dayMap.set(key, (dayMap.get(key) ?? 0) + item.quantity);
        }
        if (isWeek) {
          weekMap.set(key, (weekMap.get(key) ?? 0) + item.quantity);
        }
      });
    });

    const toList = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return { day: toList(dayMap), week: toList(weekMap) };
  }, [orders]);

  const activeList = useMemo(
    () =>
      [...activeOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [activeOrders]
  );

  const hasDailyStats = dailyStats.some((d) => d.revenue > 0 || d.orders > 0);
  const hasHourlyStats = hourlyBuckets.some((d) => d.value > 0);
  const hasTypeStats = orderTypeData.some((d) => d.value > 0);

  const popularList = popularRange === "day" ? popularItems.day : popularItems.week;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Дашборд</p>
          <h2 className="admin-page__title">Сводка по заказам</h2>
          <p className="muted">Сегодня, активные заказы и динамика за неделю в одном месте.</p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить данные
        </button>
      </div>

      <div className="dashboard-grid dashboard-grid--top">
        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Заказы за день</div>
              <div className="dashboard-card__subtitle">Доставка и самовывоз</div>
            </div>
          </div>
          <div className="donut-block">
            <div className="donut-chart">
              {hasTypeStats ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orderTypeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={86}
                        paddingAngle={2}
                      >
                        {orderTypeData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <div className="donut-center__value">{todayOrders.length}</div>
                    <div className="donut-center__label">заказов</div>
                  </div>
                </>
              ) : (
                <div className="chart-empty">Нет заказов за сегодня</div>
              )}
            </div>
            <div className="donut-legend">
              {orderTypeData.map((entry) => (
                <div key={entry.name} className="donut-legend__item">
                  <span className="donut-legend__label">
                    <span className="donut-legend__dot" style={{ background: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="donut-legend__value">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Заказы за день по часам</div>
              <div className="dashboard-card__subtitle">Интервал с 8:00 до 23:00</div>
            </div>
          </div>
          {!hasHourlyStats ? (
            <div className="chart-empty">Нет заказов в этом интервале</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RBarChart data={hourlyBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Заказы" fill="var(--accent)" radius={[10, 10, 4, 4]} />
              </RBarChart>
            </ResponsiveContainer>
          )}
        </div>
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
          subtitle="Общее количество заказов"
          accent="#1c7ed6"
        />
        <SummaryCard
          title="Выручка сегодня" 
          value={`${formatMoney(revenueToday)} ₽`}
          subtitle="Сумма всех чеков"
          accent="#2f9e44"
        />
        <SummaryCard
          title="Средний чек"
          value={avgToday ? `${formatMoney(avgToday)} ₽` : "-"}
          subtitle="По заказам сегодня"
          accent="#845ef7"
        />
      </div>

      <div className="dashboard-panel dashboard-panel--accent">
        <div className="dashboard-panel__header">
          <div>
            <h3 className="dashboard-panel__title">Активные заказы</h3>
            <p className="dashboard-panel__meta">Последние заказы в работе</p>
          </div>
          <div className="active-orders__badges">
            <span className="chip chip--soft">{activeOrders.length} в работе</span>
            <span className="chip chip--ghost">{todayOrders.length} сегодня</span>
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

      <div className="dashboard-grid dashboard-grid--bottom">
        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Динамика за 7 дней</div>
              <div className="dashboard-card__subtitle">Выручка и количество заказов</div>
            </div>
            <div className="chart-card__legend">
              <span className="legend-dot" />
              <span>Выручка</span>
              <span className="legend-dot legend-dot--secondary" />
              <span>Заказы</span>
            </div>
          </div>
          {!hasDailyStats ? (
            <div className="chart-empty">Нет данных за период</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip currency />} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Выручка"
                  fill="rgba(255, 140, 58, 0.25)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Заказы"
                  stroke="#1c7ed6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Популярные позиции</div>
              <div className="dashboard-card__subtitle">
                {popularRange === "day" ? "Топ за день" : "Топ за неделю"}
              </div>
            </div>
            <div className="range-tabs">
              <button
                className={`range-tab${popularRange === "day" ? " range-tab--active" : ""}`}
                onClick={() => setPopularRange("day")}
                type="button"
              >
                День
              </button>
              <button
                className={`range-tab${popularRange === "week" ? " range-tab--active" : ""}`}
                onClick={() => setPopularRange("week")}
                type="button"
              >
                Неделя
              </button>
            </div>
          </div>
          {popularList.length === 0 ? (
            <div className="muted">Нет данных по позициям.</div>
          ) : (
            <ul className="popular-list">
              {popularList.map((item, index) => (
                <li key={item.name} className="popular-item">
                  <span className="popular-item__name">
                    {index + 1}. {item.name}
                  </span>
                  <span className="popular-item__count">{item.count} шт.</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
