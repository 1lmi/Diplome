import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminOrder, StatusOption } from "../../types";
import { dayKey, isSameDay, terminalStatuses } from "./utils";

interface Props {
  orders: AdminOrder[];
  statuses: StatusOption[];
  onRefresh: () => void;
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

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ dataKey: string; name: string; value: number }>;
  label?: string;
  currency?: boolean;
}> = ({ active, payload, label, currency }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="chart-tooltip">
      {label && <div className="chart-tooltip__label">{label}</div>}
      {payload.map((point) => (
        <div key={point.dataKey} className="chart-tooltip__row">
          <span>{point.name}</span>
          <strong>{currency ? `${formatMoney(point.value)} ₽` : point.value}</strong>
        </div>
      ))}
    </div>
  );
};

const getDeliveryMethod = (order: AdminOrder) => {
  if (order.delivery_method === "delivery" || order.delivery_method === "pickup") {
    return order.delivery_method;
  }
  return (order.customer_address ?? "").trim() ? "delivery" : "pickup";
};

const weekDayLabel = (index: number) => {
  const labels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return labels[index] ?? "—";
};

const AdminStatisticsPage: React.FC<Props> = ({ orders, statuses, onRefresh }) => {
  const [popularRange, setPopularRange] = useState<"day" | "week" | "all">("week");

  const todayOrders = useMemo(() => {
    const today = new Date();
    return orders.filter((order) => isSameDay(new Date(order.created_at), today));
  }, [orders]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !terminalStatuses.has(order.status.toLowerCase())),
    [orders]
  );

  const totalRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + order.total_price, 0),
    [orders]
  );

  const revenueToday = useMemo(
    () => todayOrders.reduce((sum, order) => sum + order.total_price, 0),
    [todayOrders]
  );

  const avgCheck = orders.length ? Math.round(totalRevenue / orders.length) : 0;
  const avgCheckToday = todayOrders.length ? Math.round(revenueToday / todayOrders.length) : 0;

  const deliveryCount = todayOrders.filter((order) => getDeliveryMethod(order) === "delivery").length;
  const pickupCount = Math.max(todayOrders.length - deliveryCount, 0);

  const orderTypeData = [
    { name: "Доставка", value: deliveryCount, color: "#ff8c3a" },
    { name: "Самовывоз", value: pickupCount, color: "#ffd2ad" },
  ];

  const hourlyBuckets = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      label: `${String(hour).padStart(2, "0")}:00`,
      value: 0,
      revenue: 0,
    }));

    todayOrders.forEach((order) => {
      const hour = new Date(order.created_at).getHours();
      buckets[hour].value += 1;
      buckets[hour].revenue += order.total_price;
    });

    return buckets;
  }, [todayOrders]);

  const last14Days = useMemo(() => {
    const now = new Date();
    const map: Record<string, { revenue: number; orders: number }> = {};

    orders.forEach((order) => {
      const key = dayKey(new Date(order.created_at));
      map[key] = map[key] ?? { revenue: 0, orders: 0 };
      map[key].revenue += order.total_price;
      map[key].orders += 1;
    });

    const result: { label: string; revenue: number; orders: number }[] = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - offset);
      const key = dayKey(day);
      const label = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(day);
      result.push({
        label,
        revenue: map[key]?.revenue ?? 0,
        orders: map[key]?.orders ?? 0,
      });
    }

    return result;
  }, [orders]);

  const weekDayStats = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, index) => ({
      label: weekDayLabel(index),
      orders: 0,
      revenue: 0,
    }));

    orders.forEach((order) => {
      const day = new Date(order.created_at).getDay();
      buckets[day].orders += 1;
      buckets[day].revenue += order.total_price;
    });

    return buckets;
  }, [orders]);

  const statusStats = useMemo(() => {
    const counts = new Map<string, number>();
    orders.forEach((order) => {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    });

    return statuses
      .map((status) => ({
        code: status.code,
        name: status.name,
        count: counts.get(status.code) ?? 0,
      }))
      .filter((item) => item.count > 0);
  }, [orders, statuses]);

  const popularItems = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);

    const dayMap = new Map<string, number>();
    const weekMap = new Map<string, number>();
    const allMap = new Map<string, number>();

    orders.forEach((order) => {
      const created = new Date(order.created_at);
      const items = order.items ?? [];
      const isToday = created >= todayStart;
      const isWeek = created >= weekStart;

      items.forEach((item) => {
        const key = item.product_name || "Позиция";
        allMap.set(key, (allMap.get(key) ?? 0) + item.quantity);
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
        .slice(0, 8);

    return {
      day: toList(dayMap),
      week: toList(weekMap),
      all: toList(allMap),
    };
  }, [orders]);

  const popularList = popularItems[popularRange];

  const completeStatuses = new Set(["done", "delivered", "completed", "finished"]);
  const cancelStatuses = new Set(["cancelled", "canceled"]);

  const completedCount = useMemo(
    () => orders.filter((order) => completeStatuses.has(order.status.toLowerCase())).length,
    [orders]
  );

  const cancelledCount = useMemo(
    () => orders.filter((order) => cancelStatuses.has(order.status.toLowerCase())).length,
    [orders]
  );

  const hasHourlyStats = hourlyBuckets.some((bucket) => bucket.value > 0);
  const hasLast14Days = last14Days.some((day) => day.orders > 0 || day.revenue > 0);
  const hasWeekDayStats = weekDayStats.some((day) => day.orders > 0);
  const hasTypeStats = orderTypeData.some((item) => item.value > 0);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Статистика</p>
          <h2 className="admin-page__title">Полная аналитика заказов</h2>
          <p className="muted">
            По часам, по дням, по статусам, по способу доставки и по популярности блюд.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить данные
        </button>
      </div>

      <div className="dashboard-summary">
        <SummaryCard
          title="Всего заказов"
          value={String(orders.length)}
          subtitle="За всё время"
          accent="#ff8c3a"
        />
        <SummaryCard
          title="Активные"
          value={String(activeOrders.length)}
          subtitle="Сейчас в работе"
          accent="#1c7ed6"
        />
        <SummaryCard
          title="Выручка"
          value={`${formatMoney(totalRevenue)} ₽`}
          subtitle="Общая сумма заказов"
          accent="#2f9e44"
        />
        <SummaryCard
          title="Средний чек"
          value={avgCheck ? `${formatMoney(avgCheck)} ₽` : "-"}
          subtitle="По всем заказам"
          accent="#845ef7"
        />
        <SummaryCard
          title="Завершено"
          value={String(completedCount)}
          subtitle="Успешно закрытые заказы"
          accent="#12b886"
        />
        <SummaryCard
          title="Отменено"
          value={String(cancelledCount)}
          subtitle="Отменённые заказы"
          accent="#fa5252"
        />
        <SummaryCard
          title="Сегодня"
          value={String(todayOrders.length)}
          subtitle={`Выручка ${formatMoney(revenueToday)} ₽`}
          accent="#f76707"
        />
        <SummaryCard
          title="Средний чек сегодня"
          value={avgCheckToday ? `${formatMoney(avgCheckToday)} ₽` : "-"}
          subtitle="По сегодняшним заказам"
          accent="#364fc7"
        />
      </div>

      <div className="dashboard-grid dashboard-grid--top">
        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Заказы по часам</div>
              <div className="dashboard-card__subtitle">Сегодня, по каждому часу суток</div>
            </div>
          </div>
          {!hasHourlyStats ? (
            <div className="chart-empty">За сегодня пока нет заказов</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <RBarChart data={hourlyBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Заказы" fill="var(--accent)" radius={[10, 10, 4, 4]} />
              </RBarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Доставка или самовывоз</div>
              <div className="dashboard-card__subtitle">Срез только за сегодня</div>
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
                <div className="chart-empty">Нет данных за сегодня</div>
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
      </div>

      <div className="dashboard-grid dashboard-grid--bottom">
        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Динамика за 14 дней</div>
              <div className="dashboard-card__subtitle">Выручка и количество заказов по дням</div>
            </div>
            <div className="chart-card__legend">
              <span className="legend-dot" />
              <span>Выручка</span>
              <span className="legend-dot legend-dot--secondary" />
              <span>Заказы</span>
            </div>
          </div>
          {!hasLast14Days ? (
            <div className="chart-empty">Недостаточно данных для графика</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={last14Days}>
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
              <div className="dashboard-card__title">Активность по дням недели</div>
              <div className="dashboard-card__subtitle">Где чаще всего приходят заказы</div>
            </div>
          </div>
          {!hasWeekDayStats ? (
            <div className="chart-empty">Нет накопленных данных</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <RBarChart data={weekDayStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="orders" name="Заказы" fill="#1c7ed6" radius={[10, 10, 4, 4]} />
              </RBarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid--bottom">
        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Статусы заказов</div>
              <div className="dashboard-card__subtitle">Текущая структура по всем статусам</div>
            </div>
          </div>
          {statusStats.length === 0 ? (
            <div className="chart-empty">Нет заказов для анализа</div>
          ) : (
            <div className="stats-list">
              {statusStats.map((status) => (
                <div key={status.code} className="stats-list__item">
                  <span className="stats-list__name">{status.name}</span>
                  <span className="stats-list__value">{status.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <div className="dashboard-card__title">Популярность блюд</div>
              <div className="dashboard-card__subtitle">
                {popularRange === "day"
                  ? "Топ за день"
                  : popularRange === "week"
                    ? "Топ за неделю"
                    : "Топ за всё время"}
              </div>
            </div>
            <div className="range-tabs">
              <button
                type="button"
                className={`range-tab${popularRange === "day" ? " range-tab--active" : ""}`}
                onClick={() => setPopularRange("day")}
              >
                День
              </button>
              <button
                type="button"
                className={`range-tab${popularRange === "week" ? " range-tab--active" : ""}`}
                onClick={() => setPopularRange("week")}
              >
                Неделя
              </button>
              <button
                type="button"
                className={`range-tab${popularRange === "all" ? " range-tab--active" : ""}`}
                onClick={() => setPopularRange("all")}
              >
                Всё
              </button>
            </div>
          </div>
          {popularList.length === 0 ? (
            <div className="chart-empty">Нет данных по блюдам</div>
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
    </div>
  );
};

export default AdminStatisticsPage;
