import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../authContext";
import { getOrderTracking } from "../orderTracking";
import type { Order } from "../types";

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

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
    } catch (e: any) {
      const status = e?.status;
      if (status === 401 || status === 403 || status === 404) {
        setNotFound(true);
      } else {
        setError(e?.message || "Не удалось загрузить заказ.");
      }
    } finally {
      setLoadingOrder(false);
    }
  }, [parsedId, user]);

  useEffect(() => {
    if (loading) return;
    loadOrder();
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
          <button className="btn btn--outline" onClick={loadOrder}>
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

  return (
    <section className="order-page">
      <div className="order-page__header">
        <div>
          <p className="eyebrow">Заказ</p>
          <h1 className="order-page__title">№{order.id}</h1>
          <div className="order-page__meta">
            {getDeliveryLabel(order)} · {formatDateTime(order.created_at)}
          </div>
        </div>
        <div className="order-page__actions">
          <span className="chip">{order.status_name}</span>
          <button className="btn btn--outline btn--sm" onClick={loadOrder}>
            Обновить
          </button>
          <Link className="btn btn--ghost btn--sm" to={backLink}>
            Назад
          </Link>
        </div>
      </div>

      <div className="order-page__grid">
        <div className="order-card order-card--profile">
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
        </div>

        <div className="panel order-page__side">
          <div className="panel__header">
            <h3>Детали заказа</h3>
          </div>
          <div className="stack gap-8">
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
        </div>
      </div>

      <div className="panel">
        <div className="panel__header">
          <h3>История статусов</h3>
        </div>
        {order.history.length === 0 ? (
          <div className="muted">История статусов пока пуста.</div>
        ) : (
          <div className="order-history">
            {order.history.map((item, index) => (
              <div key={`${item.status}-${index}`} className="order-history__item">
                <div>
                  <div className="order-history__title">{item.status_name}</div>
                  {item.comment ? (
                    <div className="order-history__comment">{item.comment}</div>
                  ) : null}
                </div>
                <div className="order-history__time">{formatDateTime(item.changed_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default OrderDetailsPage;
