import React from "react";
import { useCart } from "../cartContext";

interface Props {
  onCartClick: () => void;
}

export const Header: React.FC<Props> = ({ onCartClick }) => {
  const { totalCount, totalPrice } = useCart();

  return (
    <header className="header">
      <div className="header__left">
        <div className="logo">Meat&nbsp;Point</div>
        <nav className="nav">
          <button className="nav__link nav__link--active">Меню</button>
          <button className="nav__link">О нас</button>
          <button className="nav__link">Контакты</button>
        </nav>
      </div>
      <button className="cart-button" onClick={onCartClick}>
        <span className="cart-button__price">{totalPrice || 0} ₽</span>
        <span className="cart-button__divider" />
        <span className="cart-button__count">
          {totalCount ? `${totalCount} товар` : "Корзина"}
        </span>
      </button>
    </header>
  );
};
