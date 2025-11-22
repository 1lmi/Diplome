import React, { useMemo, useState } from "react";
import type { AdminOrder, StatusOption } from "../../types";
import { isSameDay, terminalStatuses } from "./utils";

interface Props {
  orders: AdminOrder[];
  statuses: StatusOption[];
  orderStatuses: Record<number, string>;
  onStatusChange: (orderId: number, status: string) => void;
  onApplyStatus: (orderId: number) => Promise<void>;
  onRefresh: () => void;
}

const AdminOrdersPage: React.FC<Props> = ({
  orders,
  statuses,
  orderStatuses,
  onStatusChange,
  onApplyStatus,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyToday, setOnlyToday] = useState(true);
  const [onlyActive, setOnlyActive] = useState(false);
  const [query, setQuery] = useState("");

  const now = new Date();

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (onlyToday && !isSameDay(new Date(o.created_at), now)) return false;
        if (onlyActive && terminalStatuses.has(o.status.toLowerCase())) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          String(o.id).includes(q) ||
          (o.customer_phone || "").toLowerCase().includes(q) ||
          (o.customer_name || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, statusFilter, onlyToday, onlyActive, query, now]);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Заказы</p>
          <h2 className="admin-page__title">Мониторинг и статусы</h2>
          <p className="muted">Фильтруйте по статусу, актуальным заказам или ищите по телефону.</p>
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
              {statuses.map((s) => (
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
          <label className="field-inline">
            <span>Только активные</span>
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
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
              <div className="admin-row__title">№-{order.id} · {order.total_price} ₽</div>
              <div className="admin-row__meta">
                {order.customer_name || "Гость"} · {order.customer_phone || "—"} · {new Date(order.created_at).toLocaleString()}
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
          <div className="muted">Ничего не найдено под выбранные фильтры.</div>
        )}
      </div>
    </div>
  );
};

export default AdminOrdersPage;
