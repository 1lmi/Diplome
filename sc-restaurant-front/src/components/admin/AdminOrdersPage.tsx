import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminOrder, StatusOption } from "../../types";
import {
  canCancel,
  formatTime,
  getCurrentLane,
  getEffectiveDeliveryKind,
  getNextActionLabel,
  getNextStatus,
  getStatusDisplayName,
  isSameDay,
  isTerminalStatus,
  terminalStatuses,
  type CurrentOrderLane,
} from "./utils";

interface Props {
  orders: AdminOrder[];
  statuses: StatusOption[];
  mode: "current" | "history";
  onTransition: (orderId: number, targetStatus: string) => Promise<boolean>;
  onRefresh: () => void;
}

type PendingOrderAction = {
  orderId: number;
  targetStatus: string;
  kind: "advance" | "cancel";
} | null;

const laneConfig: Array<{ key: CurrentOrderLane; title: string; description: string }> = [
  { key: "new", title: "Новый", description: "Только что поступили" },
  { key: "cooking", title: "Готовится", description: "Заказы на кухне" },
  { key: "ready", title: "Готов", description: "Ждут выдачи или курьера" },
  { key: "on_way", title: "В пути", description: "Переданы на доставку" },
];

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const formatOrderAge = (value: string) => {
  const createdAt = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)} мин назад`;
  }
  if (diffMinutes < 24 * 60) {
    return `${Math.floor(diffMinutes / 60)} ч назад`;
  }
  return `${new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  })} · ${formatTime(value)}`;
};

const formatFullDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const getDeliveryLabel = (order: AdminOrder) =>
  getEffectiveDeliveryKind(order) === "delivery" ? "Доставка" : "Самовывоз";

const getPaymentLabel = (order: AdminOrder) => {
  if (order.payment_method === "card") return "Картой";
  if (order.payment_method === "cash") return "Наличными";
  return null;
};

const getItemsPreview = (order: AdminOrder) => {
  const primaryItems = order.items.slice(0, 2).map((item) => item.product_name);
  const extraCount = order.items.length - primaryItems.length;
  const parts = [...primaryItems];
  if (extraCount > 0) {
    parts.push(`+${extraCount}`);
  }
  return parts.join(" · ");
};

const getServiceMeta = (order: AdminOrder) => {
  const parts: string[] = [];
  const payment = getPaymentLabel(order);
  if (payment) parts.push(payment);
  if (order.delivery_time) parts.push(order.delivery_time);
  if (order.do_not_call) parts.push("без звонка");
  return parts.join(" · ");
};

const AdminOrdersPage: React.FC<Props> = ({
  orders,
  statuses,
  mode,
  onTransition,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyToday, setOnlyToday] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingOrderAction>(null);
  const [submittingOrderId, setSubmittingOrderId] = useState<number | null>(null);

  const now = new Date();
  const isHistoryView = mode === "history";

  const availableStatuses = useMemo(() => {
    const filtered = statuses.filter((status) =>
      terminalStatuses.has(status.code.toLowerCase())
    );
    return filtered.length ? filtered : statuses;
  }, [statuses]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const isTerminal = isTerminalStatus(order.status);
        if (isHistoryView ? !isTerminal : isTerminal) return false;
        if (isHistoryView && statusFilter !== "all" && order.status !== statusFilter) return false;
        if (onlyToday && !isSameDay(new Date(order.created_at), now)) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          String(order.id).includes(q) ||
          (order.customer_phone || "").toLowerCase().includes(q) ||
          (order.customer_name || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return isHistoryView ? timeB - timeA : timeA - timeB;
      });
  }, [orders, isHistoryView, statusFilter, onlyToday, query, now]);

  const groupedCurrentOrders = useMemo(() => {
    const lanes: Record<CurrentOrderLane, AdminOrder[]> = {
      new: [],
      cooking: [],
      ready: [],
      on_way: [],
    };
    const other: AdminOrder[] = [];

    if (isHistoryView) {
      return { lanes, other };
    }

    for (const order of filteredOrders) {
      const lane = getCurrentLane(order.status);
      if (lane) {
        lanes[lane].push(order);
      } else {
        other.push(order);
      }
    }

    return { lanes, other };
  }, [filteredOrders, isHistoryView]);

  const title = isHistoryView ? "История заказов" : "Текущие заказы";
  const subtitle = isHistoryView
    ? "Завершённые и отменённые заказы. Можно быстро найти нужный заказ и открыть детали."
    : "Компактная доска для быстрых действий: каждый заказ показывает только следующий допустимый шаг.";
  const emptyMessage = isHistoryView
    ? "История заказов пока пуста."
    : "Сейчас нет заказов в работе.";
  const backTo = isHistoryView ? "/admin/orders/history" : "/admin/orders/current";

  const beginAction = (orderId: number, targetStatus: string, kind: "advance" | "cancel") => {
    if (submittingOrderId !== null) return;
    setPendingAction({ orderId, targetStatus, kind });
  };

  const cancelPendingAction = () => {
    if (submittingOrderId !== null) return;
    setPendingAction(null);
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setSubmittingOrderId(pendingAction.orderId);
    const ok = await onTransition(pendingAction.orderId, pendingAction.targetStatus);
    setSubmittingOrderId(null);
    if (ok) {
      setPendingAction(null);
    }
  };

  const renderCurrentOrderCard = (order: AdminOrder) => {
    const nextStatus = getNextStatus(order);
    const nextActionLabel = getNextActionLabel(order);
    const canCancelOrder = canCancel(order);
    const serviceMeta = getServiceMeta(order);
    const isPending = pendingAction?.orderId === order.id;
    const isBusy = submittingOrderId === order.id;
    const pendingLabel =
      pendingAction?.kind === "cancel"
        ? "Отменить заказ?"
        : `Перевести заказ в статус "${getStatusDisplayName(
            pendingAction?.targetStatus || ""
          )}"?`;

    return (
      <article
        key={order.id}
        className={
          "current-order-card" +
          (isPending ? " current-order-card--pending" : "") +
          (isBusy ? " current-order-card--busy" : "")
        }
      >
        <div className="current-order-card__header">
          <div className="current-order-card__header-main">
            <Link className="current-order-card__link" to={`/orders/${order.id}`} state={{ backTo }}>
              №{order.id}
            </Link>
            <div className="current-order-card__stamp">{formatTime(order.created_at)}</div>
          </div>
          <div className="current-order-card__sum">
            <span className="current-order-card__age">{formatOrderAge(order.created_at)}</span>
            <strong className="current-order-card__sum-value">{formatPrice(order.total_price)}</strong>
          </div>
        </div>

        <div className="current-order-card__customer">
          <strong className="current-order-card__customer-name">
            {order.customer_name || "Гость"}
          </strong>
          <span className="current-order-card__customer-phone">{order.customer_phone || "—"}</span>
        </div>

        <div className="current-order-card__facts">
          <div className="current-order-card__fact">
            <span>Тип</span>
            <strong>{getDeliveryLabel(order)}</strong>
          </div>
          <div className="current-order-card__fact">
            <span>Позиций</span>
            <strong>{order.items.length}</strong>
          </div>
        </div>

        {serviceMeta ? <div className="current-order-card__service">{serviceMeta}</div> : null}

        <div className="current-order-card__items-box">
          <div className="current-order-card__items-label">Состав</div>
          <div className="current-order-card__items">
            {getItemsPreview(order) || "Состав заказа скрыт"}
          </div>
        </div>

        <div className="current-order-card__actions">
          {nextStatus && nextActionLabel ? (
            <button
              className="btn btn--primary btn--sm current-order-card__primary-action"
              onClick={() => beginAction(order.id, nextStatus, "advance")}
              disabled={isBusy}
            >
              {nextActionLabel}
            </button>
          ) : null}

          <div className="current-order-card__secondary-actions">
            {canCancelOrder ? (
              <button
                className="btn btn--outline btn--sm current-order-card__cancel"
                onClick={() => beginAction(order.id, "canceled", "cancel")}
                disabled={isBusy}
              >
                Отменить
              </button>
            ) : null}

            <Link
              className="btn btn--ghost btn--sm current-order-card__details"
              to={`/orders/${order.id}`}
              state={{ backTo }}
            >
              Подробнее
            </Link>
          </div>
        </div>

        {isPending ? (
          <div className="current-order-card__confirm">
            <div className="current-order-card__confirm-text">{pendingLabel}</div>
            <div className="current-order-card__confirm-actions">
              <button
                className="btn btn--primary btn--sm"
                onClick={confirmPendingAction}
                disabled={isBusy}
              >
                {isBusy ? "Обновляем..." : "Подтвердить"}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={cancelPendingAction}
                disabled={isBusy}
              >
                {pendingAction?.kind === "cancel" ? "Назад" : "Отмена"}
              </button>
            </div>
          </div>
        ) : null}
      </article>
    );
  };

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
          {isHistoryView ? (
            <label className="field-inline">
              <span>Статус</span>
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Все</option>
                {availableStatuses.map((status) => (
                  <option key={status.code} value={status.code}>
                    {status.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field-inline">
            <span>Только сегодня</span>
            <input
              type="checkbox"
              checked={onlyToday}
              onChange={(e) => setOnlyToday(e.target.checked)}
            />
          </label>
        </div>

        <input
          className="input"
          placeholder="Поиск по номеру заказа, телефону или имени"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isHistoryView ? (
        <div className="stack gap-6">
          {filteredOrders.map((order) => (
            <div key={order.id} className="admin-row admin-row--history">
              <div>
                <div className="admin-row__title">
                  <Link className="admin-row__link" to={`/orders/${order.id}`} state={{ backTo }}>
                    №{order.id}
                  </Link>{" "}
                  · {formatPrice(order.total_price)}
                </div>
                <div className="admin-row__meta">
                  {order.customer_name || "Гость"} · {order.customer_phone || "—"} ·{" "}
                  {formatFullDateTime(order.created_at)}
                </div>
              </div>
              <div className="admin-row__controls">
                <span className="chip chip--soft">{order.status_name}</span>
                <Link className="btn btn--ghost btn--sm" to={`/orders/${order.id}`} state={{ backTo }}>
                  Подробнее
                </Link>
              </div>
            </div>
          ))}

          {filteredOrders.length === 0 ? (
            <div className="muted">
              {query || statusFilter !== "all" || onlyToday
                ? "Ничего не найдено под выбранные фильтры."
                : emptyMessage}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="orders-board">
            {laneConfig.map((lane) => (
              <section key={lane.key} className="orders-board__lane">
                <div className="orders-board__lane-header">
                  <div>
                    <h3>{lane.title}</h3>
                    <p className="muted">{lane.description}</p>
                  </div>
                  <span className="orders-board__lane-count">
                    {groupedCurrentOrders.lanes[lane.key].length}
                  </span>
                </div>

                <div className="orders-board__lane-body">
                  {groupedCurrentOrders.lanes[lane.key].length > 0 ? (
                    groupedCurrentOrders.lanes[lane.key].map(renderCurrentOrderCard)
                  ) : (
                    <div className="orders-board__empty">Нет заказов</div>
                  )}
                </div>
              </section>
            ))}
          </div>

          {groupedCurrentOrders.other.length > 0 ? (
            <section className="orders-board__fallback">
              <div className="orders-board__lane-header">
                <div>
                  <h3>Прочее</h3>
                  <p className="muted">Нетиповые активные статусы. Их можно открыть или отменить.</p>
                </div>
                <span className="orders-board__lane-count">{groupedCurrentOrders.other.length}</span>
              </div>
              <div className="orders-board__lane-body">
                {groupedCurrentOrders.other.map(renderCurrentOrderCard)}
              </div>
            </section>
          ) : null}

          {filteredOrders.length === 0 ? <div className="muted">{emptyMessage}</div> : null}
        </>
      )}
    </div>
  );
};

export default AdminOrdersPage;
