import React, { useMemo } from "react";
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

const BarChart: React.FC<{
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}> = ({ title, data, color = "var(--accent)" }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  const isEmpty = data.every((d) => d.value === 0);
  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <div className="chart-card__title">{title}</div>
      </div>
      {isEmpty ? (
        <div className="chart-empty">Нет данных за период</div>
      ) : (
        <div className="chart chart--bars">
          {data.map((d) => (
            <div key={d.label} className="chart__bar">
              <div
                className="chart__bar-fill"
                style={{
                  height: `${(d.value / max) * 100}%`,
                  background: color,
                }}
                title={`${d.label}: ${d.value}`}
              />
              <div className="chart__bar-label">{d.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Sparkline: React.FC<{
  title: string;
  data: { label: string; value: number }[];
  color?: string;
}> = ({ title, data, color = "var(--accent)" }) => {
  if (!data.length) {
    return (
      <div className="chart-card">
        <div className="chart-card__header">
          <div className="chart-card__title">{title}</div>
        </div>
        <div className="chart-empty">Нет данных</div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const points = data.map((d, idx) => {
    const x = (idx / Math.max(data.length - 1, 1)) * 100;
    const y = 100 - (d.value / max) * 100;
    return `${x},${y}`;
  });

  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <div className="chart-card__title">{title}</div>
      </div>
      <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          className="sparkline__area"
          fill={`${color}22`}
          points={`0,100 ${points.join(" ")} 100,100`}
        />
        <polyline
          className="sparkline__line"
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points.join(" ")}
        />
      </svg>
      <div className="sparkline__labels">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
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

  const revenueByDay = useMemo(() => {
    const list: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = dayKey(day);
      const dayRevenue = orders
        .filter((o) => dayKey(new Date(o.created_at)) === key)
        .reduce((sum, o) => sum + o.total_price, 0);
      const label = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(day);
      list.push({ label, value: dayRevenue });
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

  const activeList = [...activeOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Дашборд</p>
          <h2 className="admin-page__title">Текущее состояние заказов</h2>
          <p className="muted">Актуальные заказы, динамика за сегодня и сводка по статусам.</p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить данные
        </button>
      </div>

      <div className="stat-grid">
        <StatCard
          title="Активные заказы"
          value={String(activeOrders.length)}
          subtitle="в обработке сейчас"
          accent="#ff6b3d"
        />
        <StatCard
          title="Заказов сегодня"
          value={String(todayOrders.length)}
          subtitle="оформлено за текущий день"
          accent="#1c7ed6"
        />
        <StatCard
          title="Выручка сегодня"
          value={`${revenueToday} ₽`}
          subtitle="сумма оплаченных заказов"
          accent="#2f9e44"
        />
        <StatCard
          title="Средний чек"
          value={avgToday ? `${avgToday} ₽` : "—"}
          subtitle="по сегодняшним заказам"
          accent="#ae3ec9"
        />
      </div>

      <div className="grid grid-2 gap-12">
        <BarChart title="Заказы по времени (сегодня)" data={hourlyBuckets} />
        <Sparkline title="Выручка за 7 дней" data={revenueByDay} />
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h3>Статусы</h3>
            <p className="muted">Распределение заказов по статусам</p>
          </div>
          <span className="chip chip--soft">{orders.length} заказов</span>
        </div>
        {statusCounts.length === 0 && <div className="muted">Пока нет заказов.</div>}
        <div className="status-grid">
          {statusCounts.map((s) => (
            <div key={s.code} className="status-card">
              <div className="status-card__header">
                <span className="status-card__dot" />
                <span>{s.label}</span>
              </div>
              <div className="status-card__value">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2 gap-12">
        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Активные заказы</h3>
              <p className="muted">Те, что ещё не закрыты</p>
            </div>
          </div>
          {activeList.length === 0 && <div className="muted">Все заказы завершены.</div>}
          <div className="stack gap-6">
            {activeList.slice(0, 6).map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-card__top">
                  <div>
                    <div className="order-card__id">№-{order.id}</div>
                    <div className="order-card__meta">
                      {order.customer_name || "Гость"} · {order.customer_phone || "—"} · {formatTime(order.created_at)}
                    </div>
                  </div>
                  <div className="order-card__sum">{order.total_price} ₽</div>
                </div>
                <div className="order-card__status">{order.status_name || order.status}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>Настройки витрины</h3>
              <p className="muted">Заголовки и контакты на главной странице</p>
            </div>
            <button className="btn btn--primary" onClick={onSaveSettings} disabled={saving}>
              Сохранить
            </button>
          </div>
          <div className="stack gap-8">
            <label className="field">
              <span>Титул</span>
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
