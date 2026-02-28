import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminOrder, StatusOption } from "../../types";
import { isSameDay, terminalStatuses } from "./utils";

interface Props {
  orders: AdminOrder[];
  statuses: StatusOption[];
  mode: "current" | "history";
  orderStatuses: Record<number, string>;
  onStatusChange: (orderId: number, status: string) => void;
  onApplyStatus: (orderId: number) => Promise<void>;
  onRefresh: () => void;
}

const AdminOrdersPage: React.FC<Props> = ({
  orders,
  statuses,
  mode,
  orderStatuses,
  onStatusChange,
  onApplyStatus,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyToday, setOnlyToday] = useState(false);
  const [query, setQuery] = useState("");

  const now = new Date();
  const isHistoryView = mode === "history";

  const availableStatuses = useMemo(() => {
    const filtered = statuses.filter((status) =>
      isHistoryView
        ? terminalStatuses.has(status.code.toLowerCase())
        : !terminalStatuses.has(status.code.toLowerCase())
    );
    return filtered.length ? filtered : statuses;
  }, [isHistoryView, statuses]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const isTerminal = terminalStatuses.has(o.status.toLowerCase());
        if (isHistoryView ? !isTerminal : isTerminal) return false;
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (onlyToday && !isSameDay(new Date(o.created_at), now)) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          String(o.id).includes(q) ||
          (o.customer_phone || "").toLowerCase().includes(q) ||
          (o.customer_name || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, isHistoryView, statusFilter, onlyToday, query, now]);

  const title = isHistoryView ? "История заказов" : "Текущие заказы";
  const subtitle = isHistoryView
    ? "Завершённые и отменённые заказы. Можно искать, фильтровать и при необходимости корректировать статус."
    : "Все заказы в работе. Следите за новыми заказами и быстро меняйте их статус.";
  const emptyMessage = isHistoryView
    ? "История заказов пока пуста."
    : "Сейчас нет заказов в работе.";
  const backTo = isHistoryView ? "/admin/orders/history" : "/admin/orders/current";

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Заказы</p>
          <h2 className="admin-page__title">{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      <div className="panel filters">
        <div className="filters__group">
          <label className="field-inline">
            <span>Статус</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Все</option>
              {availableStatuses.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <span>Только сегодня</span>
            <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} />
          </label>
        </div>
        <input
          className="input"
          placeholder="Поиск по номеру заказа, телефону или имени"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stack gap-6">
        {filteredOrders.map((order) => (
          <div key={order.id} className="admin-row">
            <div>
              <div className="admin-row__title">
                <Link className="admin-row__link" to={`/orders/${order.id}`} state={{ backTo }}>
                  №-{order.id}
                </Link>{" "}
                · {order.total_price} ₽
              </div>
              <div className="admin-row__meta">
                {order.customer_name || "Гость"} · {order.customer_phone || "—"} ·{" "}
                {new Date(order.created_at).toLocaleString()}
              </div>
            </div>
            <div className="admin-row__controls">
              <select
                className="input input--sm"
                value={orderStatuses[order.id] ?? order.status}
                onChange={(e) => onStatusChange(order.id, e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="btn btn--primary btn--sm" onClick={() => onApplyStatus(order.id)}>
                Применить
              </button>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && (
          <div className="muted">{query || statusFilter !== "all" || onlyToday ? "Ничего не найдено под выбранные фильтры." : emptyMessage}</div>
        )}
      </div>
    </div>
  );
};

export default AdminOrdersPage;
