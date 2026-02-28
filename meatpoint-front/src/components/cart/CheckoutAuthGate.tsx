import React from "react";

interface Props {
  onLogin: () => void;
  onContinueAsGuest: () => void;
}

export const CheckoutAuthGate: React.FC<Props> = ({
  onLogin,
  onContinueAsGuest,
}) => (
  <section className="checkout-auth-gate">
    <div className="checkout-auth-gate__copy">
      <p className="eyebrow">Быстрый вход</p>
      <h2>Войдите или продолжайте как гость</h2>
      <p className="muted">
        Авторизация ускорит оформление и сохранит заказ в истории, но можно оформить и без аккаунта.
      </p>
    </div>

    <div className="checkout-auth-gate__actions">
      <button type="button" className="btn btn--primary" onClick={onLogin}>
        Войти
      </button>
      <button type="button" className="btn btn--outline" onClick={onContinueAsGuest}>
        Продолжить как гость
      </button>
    </div>
  </section>
);

export default CheckoutAuthGate;
