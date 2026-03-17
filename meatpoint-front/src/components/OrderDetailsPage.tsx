import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../authContext";
import { getOrderTracking } from "../orderTracking";
import type { Order } from "../types";

type ProgressTone = "completed" | "current" | "future" | "danger";

interface OrderProgressStep {
  code: string;
  label: string;
  hint: string;
  tone: ProgressTone;
}

interface ActiveStatusEntry {
  status: string;
  statusName: string;
  changedAt: string;
  comment: string | null;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  cooking: "Готовится",
  ready: "Готов",
  on_way: "В пути",
  done: "Выдан",
  canceled: "Отменён",
  cancelled: "Отменён",
};

const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

const normalizeStatusCode = (value?: string | null) => (value || "").trim().toLowerCase();

const getDeliveryLabel = (order: Order) => {
  if (order.delivery_method === "delivery") return "Доставка";
  if (order.delivery_method === "pickup") return "Самовывоз";
  return (order.customer_address ?? "").trim() ? "Доставка" : "Самовывоз";
};

const getPaymentLabel = (order: Order) => {
  if (order.payment_method === "card") return "Картой при получении";
  if (order.payment_method === "cash") return "Наличными";
  return "Не указан";
};

const getStatusLabel = (code: string, fallback?: string) =>
  STATUS_LABELS[normalizeStatusCode(code)] || fallback || code;

const getActiveEntry = (order: Order): ActiveStatusEntry => {
  const latestHistoryItem = order.history.length
    ? order.history[order.history.length - 1]
    : null;

  if (latestHistoryItem) {
    return {
      status: normalizeStatusCode(latestHistoryItem.status),
      statusName: latestHistoryItem.status_name,
      changedAt: latestHistoryItem.changed_at,
      comment: (latestHistoryItem.comment || "").trim() || null,
    };
  }

  return {
    status: normalizeStatusCode(order.status),
    statusName: order.status_name,
    changedAt: order.created_at,
    comment: null,
  };
};

const getProgressSequence = (order: Order) =>
  getDeliveryLabel(order) === "Доставка"
    ? ["new", "cooking", "ready", "on_way", "done"]
    : ["new", "cooking", "ready", "done"];

const buildOrderProgressSteps = (order: Order): OrderProgressStep[] => {
  const progressSequence = getProgressSequence(order);
  const currentStatus = normalizeStatusCode(order.status);
  const visitedBaseSteps = order.history
    .map((item) => normalizeStatusCode(item.status))
    .filter((statusCode) => progressSequence.includes(statusCode));
  const latestVisitedBaseStep =
    visitedBaseSteps[visitedBaseSteps.length - 1] || progressSequence[0];

  if (CANCELED_STATUSES.has(currentStatus)) {
    const cancelIndex = Math.max(progressSequence.indexOf(latestVisitedBaseStep), 0);
    const completedSteps = progressSequence.slice(0, cancelIndex + 1).map((code) => ({
      code,
      label: getStatusLabel(code),
      hint: "Пройден",
      tone: "completed" as const,
    }));

    return [
      ...completedSteps,
      {
        code: "canceled",
        label: getStatusLabel(currentStatus, order.status_name),
        hint: "Отменён",
        tone: "danger",
      },
    ];
  }

  const currentBaseStep = progressSequence.includes(currentStatus)
    ? currentStatus
    : latestVisitedBaseStep;
  const currentIndex = Math.max(progressSequence.indexOf(currentBaseStep), 0);

  return progressSequence.map((code, index) => ({
    code,
    label: getStatusLabel(code),
    hint: index < currentIndex ? "Пройден" : index === currentIndex ? "Текущий этап" : "Далее",
    tone: index < currentIndex ? "completed" : index === currentIndex ? "current" : "future",
  }));
};

const getStatusHint = (entry: ActiveStatusEntry, order: Order) => {
  if (entry.comment) {
    return entry.comment;
  }

  const deliveryLabel = getDeliveryLabel(order);
  const status = normalizeStatusCode(entry.status);

  if (status === "new") {
    return "Заказ принят и ожидает следующего обновления от кухни.";
  }
  if (status === "cooking") {
    return "Кухня уже готовит ваш заказ.";
  }
  if (status === "ready") {
    return deliveryLabel === "Доставка"
      ? "Заказ собран и готов к передаче курьеру."
      : "Заказ готов к выдаче.";
  }
  if (status === "on_way") {
    return "Курьер уже в пути.";
  }
  if (status === "done") {
    return "Заказ завершён. Спасибо, что выбрали Meat Point.";
  }
  if (CANCELED_STATUSES.has(status)) {
    return "Заказ отменён. Если это ошибка, оформите его заново.";
  }

  return "Статус заказа обновлён.";
};

const getHistoryErrorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
};

const getHistoryErrorMessage = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "Не удалось загрузить заказ.";
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message ? message : "Не удалось загрузить заказ.";
};

const getActiveStatusTone = (status: string) =>
  CANCELED_STATUSES.has(normalizeStatusCode(status)) ? "danger" : "accent";

const OrderDetailsPage: React.FC = () => {
  const { orderId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedId = useMemo(() => Number(orderId), [orderId]);

  const loadOrder = useCallback(async () => {
    setOrder(null);
    setError(null);
    setNotFound(false);

    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setNotFound(true);
      return;
    }

    const tracking = user ? null : getOrderTracking(parsedId);
    if (!user && !tracking?.phone) {
      setNotFound(true);
      return;
    }

    setLoadingOrder(true);
    try {
      const data = await api.getOrder(parsedId, tracking?.phone);
      setOrder(data);
    } catch (caughtError: unknown) {
      const status = getHistoryErrorStatus(caughtError);
      if (status === 401 || status === 403 || status === 404) {
        setNotFound(true);
      } else {
        setError(getHistoryErrorMessage(caughtError));
      }
    } finally {
      setLoadingOrder(false);
    }
  }, [parsedId, user]);

  useEffect(() => {
    if (loading) return;
    void loadOrder();
  }, [loading, loadOrder]);

  if (loading || loadingOrder) {
    return <div className="panel">Загружаем заказ...</div>;
  }

  if (notFound) {
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Заказ не найден</h2>
            <p className="muted">
              Страница недоступна или у вас нет данных для просмотра этого заказа.
            </p>
          </div>
          <button className="btn btn--outline" onClick={() => navigate("/")}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Не удалось загрузить заказ</h2>
            <p className="muted">{error}</p>
          </div>
          <button className="btn btn--outline" onClick={() => void loadOrder()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const adminBackLink =
    (location.state as { backTo?: string } | null)?.backTo || "/admin/orders/current";
  const fallbackBackLink = getOrderTracking(order.id)
    ? `/checkout/success/${order.id}`
    : "/profile";
  const backLink = user?.is_admin ? adminBackLink : fallbackBackLink;

  const activeEntry = getActiveEntry(order);
  const progressSteps = buildOrderProgressSteps(order);
  const progressTone = getActiveStatusTone(activeEntry.status);

  return (
    <section className="order-page">
      <div className="order-page__header">
        <div className="order-page__headline">
          <p className="eyebrow">Заказ</p>
          <h1 className="order-page__title">№{order.id}</h1>
          <div className="order-page__meta">
            {getDeliveryLabel(order)} · {formatDateTime(order.created_at)}
          </div>
        </div>
        <div className="order-page__actions">
          <span
            className={
              "chip order-page__status-chip" +
              (progressTone === "danger" ? " order-page__status-chip--danger" : "")
            }
          >
            {order.status_name}
          </span>
          <button className="btn btn--outline btn--sm" onClick={() => void loadOrder()}>
            Обновить
          </button>
          <Link className="btn btn--ghost btn--sm" to={backLink}>
            Назад
          </Link>
        </div>
      </div>

      <div className="panel order-progress">
        <div className="order-progress__header">
          <div>
            <h3>Статус заказа</h3>
            <p className="muted">Следим за этапами и показываем только актуальное состояние.</p>
          </div>
          <div className="order-progress__summary">
            <span className="chip chip--ghost">{getDeliveryLabel(order)}</span>
            <span className="order-progress__updated">
              Обновлено: {formatDateTime(activeEntry.changedAt)}
            </span>
          </div>
        </div>

        <div
          className="order-progress__track"
          style={
            {
              "--order-progress-columns": `repeat(${progressSteps.length}, minmax(0, 1fr))`,
            } as React.CSSProperties
          }
        >
          {progressSteps.map((step) => (
            <div
              key={`${step.code}-${step.label}`}
              className={`order-progress__step order-progress__step--${step.tone}`}
            >
              <span className="order-progress__marker" aria-hidden="true" />
              <div className="order-progress__copy">
                <span className="order-progress__label">{step.label}</span>
                <span className="order-progress__caption">{step.hint}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          className={
            "order-status-card" + (progressTone === "danger" ? " order-status-card--danger" : "")
          }
        >
          <div className="order-status-card__main">
            <span className="order-status-card__eyebrow">Текущий статус</span>
            <strong>{activeEntry.statusName}</strong>
            <p>{getStatusHint(activeEntry, order)}</p>
          </div>
          <div className="order-status-card__meta">
            <span className="muted">Последнее обновление</span>
            <strong>{formatDateTime(activeEntry.changedAt)}</strong>
          </div>
        </div>
      </div>

      <div className="order-page__grid">
        <article className="order-card order-page__section">
          <div className="order-page__card-head">
            <div>
              <p className="order-page__card-kicker">Состав заказа</p>
              <h3>Ваш заказ</h3>
            </div>
            <span className="chip chip--ghost">{order.items.length} поз.</span>
          </div>

          <div className="order-card__table order-card__table--details">
            <div className="order-card__table-head">
              <span>Позиция</span>
              <span>Цена</span>
              <span>Кол-во</span>
              <span className="align-right">Сумма</span>
            </div>
            {order.items.map((item) => (
              <div
                key={`${item.product_size_id}-${item.product_name}`}
                className="order-card__table-row"
              >
                <span>
                  {item.product_name}
                  {item.size_name ? (
                    <em className="order-page__item-size"> · {item.size_name}</em>
                  ) : null}
                </span>
                <span>{formatPrice(item.price)}</span>
                <span>{item.quantity}</span>
                <span className="align-right">{formatPrice(item.line_total)}</span>
              </div>
            ))}
          </div>

          <div className="order-card__summary">
            <div className="order-card__summary-row">
              <span>Сумма заказа</span>
              <span>{formatPrice(order.total_price)}</span>
            </div>
            <div className="order-card__summary-row order-card__summary-row--total">
              <span>Итого</span>
              <span>{formatPrice(order.total_price)}</span>
            </div>
          </div>
        </article>

        <article className="order-card order-page__section order-page__side">
          <div className="order-page__card-head">
            <div>
              <p className="order-page__card-kicker">Контакт и доставка</p>
              <h3>Детали заказа</h3>
            </div>
          </div>

          <div className="order-page__details">
            <div className="order-page__info">
              <span className="muted">Получатель</span>
              <strong>{order.customer_name || "Гость"}</strong>
            </div>
            <div className="order-page__info">
              <span className="muted">Телефон</span>
              <strong>{order.customer_phone || "—"}</strong>
            </div>
            <div className="order-page__info">
              <span className="muted">Адрес</span>
              <strong>{order.customer_address || "—"}</strong>
            </div>
            <div className="order-page__info">
              <span className="muted">Тип</span>
              <strong>{getDeliveryLabel(order)}</strong>
            </div>
            <div className="order-page__info">
              <span className="muted">Оплата</span>
              <strong>{getPaymentLabel(order)}</strong>
            </div>
            {order.cash_change_from ? (
              <div className="order-page__info">
                <span className="muted">Подготовить сдачу с</span>
                <strong>{formatPrice(order.cash_change_from)}</strong>
              </div>
            ) : null}
            {order.delivery_time ? (
              <div className="order-page__info">
                <span className="muted">Желаемое время</span>
                <strong>{order.delivery_time}</strong>
              </div>
            ) : null}
            {order.do_not_call ? (
              <div className="order-page__info">
                <span className="muted">Связь</span>
                <strong>Не перезванивать</strong>
              </div>
            ) : null}
            {order.comment ? (
              <div className="order-page__info">
                <span className="muted">Комментарий</span>
                <strong>{order.comment}</strong>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
};

export default OrderDetailsPage;
