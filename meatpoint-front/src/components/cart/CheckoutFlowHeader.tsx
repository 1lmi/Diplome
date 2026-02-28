import React from "react";
import { Link } from "react-router-dom";

interface Props {
  step: 1 | 2 | 3;
  utilityHref: string;
  utilityLabel: string;
}

const steps = [
  { id: 1, label: "Корзина" },
  { id: 2, label: "Оформление заказа" },
  { id: 3, label: "Заказ принят" },
] as const;

export const CheckoutFlowHeader: React.FC<Props> = ({
  step,
  utilityHref,
  utilityLabel,
}) => (
  <header className="checkout-flow-header">
    <div className="checkout-flow-header__inner">
      <Link className="checkout-flow-header__brand" to="/">
        <span className="checkout-flow-header__brand-mark">MP</span>
        <span className="checkout-flow-header__brand-copy">
          <span className="checkout-flow-header__brand-title">Meat Point</span>
          <span className="checkout-flow-header__brand-subtitle">Оформление заказа</span>
        </span>
      </Link>

      <div className="checkout-flow-header__steps" aria-label="Шаги оформления">
        {steps.map((item) => (
          <div
            key={item.id}
            className={
              "checkout-step" +
              (item.id === step ? " checkout-step--active" : "") +
              (item.id < step ? " checkout-step--done" : "")
            }
          >
            <span className="checkout-step__index">{item.id}</span>
            <span className="checkout-step__label">{item.label}</span>
          </div>
        ))}
      </div>

      <Link className="checkout-flow-header__utility" to={utilityHref}>
        {utilityLabel}
      </Link>
    </div>
  </header>
);

export default CheckoutFlowHeader;
