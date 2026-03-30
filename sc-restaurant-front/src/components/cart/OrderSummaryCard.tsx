import React from "react";

export interface OrderSummaryLine {
  id: string | number;
  name: string;
  meta?: string | null;
  amount: number;
}

interface Props {
  title?: string;
  lines: OrderSummaryLine[];
  totalPrice: number;
  deliveryFee?: number;
  className?: string;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export const OrderSummaryCard: React.FC<Props> = ({
  title = "Состав заказа",
  lines,
  totalPrice,
  deliveryFee = 0,
  className,
}) => (
  <aside className={["order-summary-card", className].filter(Boolean).join(" ")}>
    <div className="order-summary-card__head">
      <h3>{title}</h3>
    </div>

    <div className="order-summary-card__body">
      {lines.map((line) => (
        <div key={line.id} className="order-summary-card__line">
          <div>
            <div className="order-summary-card__name">{line.name}</div>
            {line.meta ? <div className="order-summary-card__meta">{line.meta}</div> : null}
          </div>
          <div className="order-summary-card__amount">{formatPrice(line.amount)}</div>
        </div>
      ))}
    </div>

    <div className="order-summary-card__totals">
      <div className="order-summary-card__row">
        <span>Доставка</span>
        <span>{formatPrice(deliveryFee)}</span>
      </div>
      <div className="order-summary-card__row order-summary-card__row--total">
        <span>Сумма заказа</span>
        <span>{formatPrice(totalPrice + deliveryFee)}</span>
      </div>
    </div>
  </aside>
);

export default OrderSummaryCard;
