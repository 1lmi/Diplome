import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../authContext";
import { getOrderTracking } from "../../orderTracking";
import type { Order } from "../../types";
import OrderSummaryCard from "./OrderSummaryCard";

const paymentLabel = (value?: string | null) => {
  if (value === "card") return "Картой при получении";
  if (value === "cash") return "Наличными";
  return "Не указан";
};

export const CheckoutSuccessPage: React.FC = () => {
  const { orderId } = useParams();
  const { user, loading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  const parsedOrderId = useMemo(() => Number(orderId), [orderId]);

  useEffect(() => {
    if (loading || !Number.isFinite(parsedOrderId) || parsedOrderId <= 0) return;

    let ignore = false;
    const loadOrder = async () => {
      setLoadingOrder(true);
      try {
        const tracking = user ? null : getOrderTracking(parsedOrderId);
        const data = await api.getOrder(parsedOrderId, tracking?.phone);
        if (!ignore) {
          setOrder(data);
        }
      } catch {
        if (!ignore) {
          setOrder(null);
        }
      } finally {
        if (!ignore) {
          setLoadingOrder(false);
        }
      }
    };

    loadOrder();
    return () => {
      ignore = true;
    };
  }, [loading, parsedOrderId, user]);

  const lines =
    order?.items.map((item) => ({
      id: `${item.product_size_id}-${item.product_name}`,
      name: item.product_name,
      meta: item.size_name || null,
      amount: item.line_total,
    })) || [];

  return (
    <section className="checkout-success">
      <div className="checkout-success__layout">
        <div className="checkout-success__content">
          <div className="checkout-success__hero">
            <p className="eyebrow">Шаг 3</p>
            <h1>Заказ принят</h1>
            <p className="muted">
              {loadingOrder
                ? "Загружаем детали вашего заказа."
                : order
                ? `Заказ №${order.id} успешно создан. Мы уже передали его в работу.`
                : `Заказ №${parsedOrderId} отправлен. Детали можно открыть на странице заказа.`}
            </p>
          </div>

          {order ? (
            <div className="checkout-success__details">
              <div className="checkout-success__info">
                <div className="checkout-success__info-row">
                  <span>Способ получения</span>
                  <strong>
                    {order.delivery_method === "pickup" ? "Самовывоз" : "Доставка"}
                  </strong>
                </div>
                <div className="checkout-success__info-row">
                  <span>Оплата</span>
                  <strong>{paymentLabel(order.payment_method)}</strong>
                </div>
                {order.customer_address ? (
                  <div className="checkout-success__info-row">
                    <span>Адрес</span>
                    <strong>{order.customer_address}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="panel">
              <p className="muted">
                Детали заказа сейчас недоступны, но номер заказа уже сохранён.
              </p>
            </div>
          )}

          <div className="checkout-success__actions">
            <Link className="btn btn--primary" to={`/orders/${parsedOrderId}`}>
              Отследить заказ
            </Link>
            <Link className="btn btn--ghost" to="/">
              Вернуться в меню
            </Link>
          </div>
        </div>

        {order ? (
          <div className="checkout-success__side">
            <OrderSummaryCard lines={lines} totalPrice={order.total_price} />
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default CheckoutSuccessPage;
