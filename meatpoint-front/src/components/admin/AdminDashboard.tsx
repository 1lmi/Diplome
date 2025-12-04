import React, { useMemo } from "react";
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

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  accent?: string;
}> = ({ title, value, subtitle, accent }) => (
  <div className="stat-card">
    <div className="stat-card__title">{title}</div>
    <div className="stat-card__value" style={accent ? { color: accent } : undefined}>
      {value}
    </div>
    {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}
  </div>
);

const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string; currency?: boolean }> = ({
  active,
  payload,
  label,
  currency,
}) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip__row">
          <span>{p.name}</span>
          <strong>{currency ? `${formatMoney(p.value)}` : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const AdminDashboard: React.FC<Props> = ({
  orders,
  statuses,
  settings,
  onSettingChange,
  onSaveSettings,
  onRefresh,
  saving,
}) => {
  const now = new Date();
  const todayOrders = orders.filter((o) => isSameDay(new Date(o.created_at), now));
  const activeOrders = orders.filter((o) => !terminalStatuses.has(o.status.toLowerCase()));
  const revenueToday = todayOrders.reduce((sum, o) => sum + o.total_price, 0);
  const avgToday = todayOrders.length ? Math.round(revenueToday / todayOrders.length) : 0;

  const hourlyBuckets = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      label: `${String(i * 2).padStart(2, "0")}-${String(i * 2 + 1).padStart(2, "0")}`,
      value: 0,
    }));
    todayOrders.forEach((order) => {
      const hour = new Date(order.created_at).getHours();
      const idx = Math.floor(hour / 2);
      if (buckets[idx]) buckets[idx].value += 1;
    });
    return buckets;
  }, [todayOrders]);

  const dailyStats = useMemo(() => {
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
  }, [now, orders]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      const key = o.status;
      map[key] = (map[key] ?? 0) + 1;
    });
    const ordered =
      statuses.length > 0
        ? statuses.map((s) => ({
            code: s.code,
            label: s.name,
            value: map[s.code] ?? 0,
          }))
        : Object.entries(map).map(([code, value]) => ({ code, label: code, value }));
    return ordered.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  }, [orders, statuses]);

  const statusColors = useMemo(() => {
    const palette = ["#ff8c3a", "#1c7ed6", "#12b886", "#845ef7", "#f76707", "#f03e3e"];
    const map: Record<string, string> = {};
    statuses.forEach((s, idx) => {
      map[s.code.toLowerCase()] = palette[idx % palette.length];
    });
    return map;
  }, [statuses]);

  const activeList = [...activeOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const hasDailyStats = dailyStats.some((d) => d.revenue > 0 || d.orders > 0);
  const hasHourlyStats = hourlyBuckets.some((d) => d.value > 0);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Обзор</p>
          <h2 className="admin-page__title">Дашборд ресторана</h2>
          <p className="muted">Свежие показатели, активные заказы и настройки на одной странице.</p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить данные
        </button>
      </div>

      <div className="panel active-orders-panel">
        <div className="panel__header active-orders-panel__header">
          <div>
            <p className="eyebrow">Активные заказы</p>
            <h3 className="admin-page__title">На руках: {activeOrders.length}</h3>
            <p className="muted">Все текущие заказы наверху, с позициями и статусами.</p>
          </div>
          <div className="active-orders__badges">
            <span className="chip chip--soft">{activeOrders.length} в работе</span>
            <span className="chip chip--ghost">{todayOrders.length} сегодня</span>
          </div>
        </div>
        {activeList.length === 0 && <div className="active-orders__empty">Активных заказов нет.</div>}
        {activeList.length > 0 && (
          <div className="active-orders__grid">
            {activeList.slice(0, 6).map((order) => {
              const color = statusColors[order.status.toLowerCase()] ?? "var(--accent)";
              const items = order.items ?? [];
              return (
                <div key={order.id} className="admin-order-card">
                  <div className="admin-order-card__head">
                    <div>
                      <div className="admin-order-card__id">№{order.id}</div>
                      <div className="admin-order-card__meta">
                        {formatTime(order.created_at)} · {order.customer_name || "Гость"} · {order.customer_phone || "-"}
                      </div>
                    </div>
                    <span className="status-pill" style={{ color, background: `${color}1a` }}>
                      {order.status_name || order.status}
                    </span>
                  </div>
                  <div className="admin-order-card__items">
                    {items.length === 0 && <div className="muted">Нет позиций в заказе</div>}
                    {items.slice(0, 4).map((item) => (
                      <div
                        key={`${order.id}-${item.product_size_id}-${item.product_name}`}
                        className="admin-order-card__item"
                      >
                        <div className="admin-order-card__thumb">
                          <img src={item.image_url || "/static/default.png"} alt={item.product_name} />
                        </div>
                        <div className="admin-order-card__item-info">
                          <div className="admin-order-card__item-title">{item.product_name}</div>
                          <div className="admin-order-card__item-meta">
                            {item.size_name ? `${item.size_name} · ` : ""}
                            x{item.quantity} · {formatMoney(item.line_total)} ₽
                          </div>
                        </div>
                        <div className="admin-order-card__price">{formatMoney(item.price)} ₽</div>
                      </div>
                    ))}
                    {items.length > 4 && (
                      <div className="admin-order-card__more">+ ещё {items.length - 4} позиций</div>
                    )}
                  </div>
                  <div className="admin-order-card__footer">
                    <div className="admin-order-card__customer">
                      {order.customer_phone || "Без телефона"}
                      {order.comment && <span className="admin-order-card__comment"> · {order.comment}</span>}
                    </div>
                    <div className="admin-order-card__total">
                      <span>Сумма</span>
                      <strong>{formatMoney(order.total_price)} ₽</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="stat-grid">
        <StatCard
          title="Активные заказы"
          value={String(activeOrders.length)}
          subtitle="В работе прямо сейчас"
          accent="#ff6b3d"
        />
        <StatCard
          title="Заказы сегодня"
          value={String(todayOrders.length)}
          subtitle="За последние 24 часа"
          accent="#1c7ed6"
        />
        <StatCard
          title="Выручка сегодня"
          value={`${formatMoney(revenueToday)} ₽`}
          subtitle="Сумма всех чеков"
          accent="#2f9e44"
        />
        <StatCard
          title="Средний чек"
          value={avgToday ? `${formatMoney(avgToday)} ₽` : "-"}
          subtitle="По сегодняшним заказам"
          accent="#ae3ec9"
        />
      </div>

      <div className="grid grid-2 gap-12">
        <div className="chart-card chart-card--glass">
          <div className="chart-card__header">
            <div>
              <div className="chart-card__title">Динамика за 7 дней</div>
              <div className="chart-card__subtitle muted">Выручка и количество заказов</div>
            </div>
            <div className="chart-card__legend">
              <span className="legend-dot legend-dot--primary" />
              <span>Выручка</span>
              <span className="legend-dot legend-dot--secondary" />
              <span>Заказы</span>
            </div>
          </div>
          {!hasDailyStats ? (
            <div className="chart-empty">Нет данных</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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

        <div className="chart-card">
          <div className="chart-card__header">
            <div className="chart-card__title">Заказы по часам (сегодня)</div>
          </div>
          {!hasHourlyStats ? (
            <div className="chart-empty">Нет данных за период</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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

      <div className="grid grid-2 gap-12">
        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Статусы</h3>
              <p className="muted">Распределение всех заказов</p>
            </div>
            <span className="chip chip--soft">{orders.length} заказов</span>
          </div>
          {statusCounts.length === 0 && <div className="muted">Пока нет заказов.</div>}
          <div className="status-grid">
            {statusCounts.map((s) => {
              const color = statusColors[s.code.toLowerCase()] ?? "var(--accent)";
              return (
                <div key={s.code} className="status-card">
                  <div className="status-card__header">
                    <span className="status-card__dot" style={{ background: color, boxShadow: `0 0 0 6px ${color}22` }} />
                    <span>{s.label}</span>
                  </div>
                  <div className="status-card__value">{s.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Главная витрина</h3>
              <p className="muted">Настройки геро-блока на сайте</p>
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
              <span>Подсказка по доставке</span>
              <input
                className="input"
                value={settings.delivery_hint || ""}
                onChange={(e) => onSettingChange("delivery_hint", e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
