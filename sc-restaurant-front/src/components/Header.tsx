import React, { useEffect, useState } from "react";
import { useCart } from "../cartContext";
import { CategoryTabs } from "./CategoryTabs";
import type { Category, User } from "../types";

interface Props {
  activeView: "menu" | "profile" | "admin" | "checkout";
  onChange: (view: "menu" | "profile" | "admin") => void;
  onCartClick: () => void;
  user: User | null;
  onLogout: () => void;
  onAuthOpen: () => void;
  categories: Category[];
  activeCategoryId?: number;
  onCategoryChange: (id: number) => void;
  showBottom?: boolean;
  showCartButton?: boolean;
}

const formatPrice = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export const Header: React.FC<Props> = ({
  activeView,
  onChange,
  onCartClick,
  user,
  onLogout,
  onAuthOpen,
  categories,
  activeCategoryId,
  onCategoryChange,
  showBottom = false,
  showCartButton = false,
}) => {
  const { lineCount, totalPrice, lastAddedAt } = useCart();
  const showCategories = activeView === "menu" && categories.length > 0;
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    if (!lastAddedAt) return;
    setCartPulse(true);
    const timeoutId = window.setTimeout(() => setCartPulse(false), 720);
    return () => window.clearTimeout(timeoutId);
  }, [lastAddedAt]);

  return (
    <>
      <header className={"header" + (showBottom ? " header--with-bottom" : " header--top-only")}>
        <div className="header__inner">
          <div className="header__top">
            <button className="header__brand" type="button" onClick={() => onChange("menu")}>
              <span className="header__brand-mark">SC</span>
              <span className="header__brand-copy">
                <span className="header__brand-title">SC restaurant</span>
              </span>
            </button>

            <div className="header__nav">
              {user ? (
                <>
                  <button
                    type="button"
                    className={
                      "nav__link" + (activeView === "profile" ? " nav__link--active" : "")
                    }
                    onClick={() => onChange("profile")}
                  >
                    Профиль
                  </button>
                  <button type="button" className="link-btn" onClick={onLogout}>
                    Выйти
                  </button>
                </>
              ) : (
                <button type="button" className="link-btn" onClick={onAuthOpen}>
                  Вход / Регистрация
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {showBottom ? (
        <div className="header__bottom-shell">
          <div className="header__inner header__inner--sticky">
            <div className="header__bottom">
              {showCategories ? (
                <div className="header__categories">
                  <CategoryTabs
                    categories={categories}
                    activeId={activeCategoryId}
                    onChange={onCategoryChange}
                  />
                </div>
              ) : (
                <div className="header__categories header__categories--empty" />
              )}

              {showCartButton ? (
                <button
                  type="button"
                  className={
                    "cart-button cart-button--compact" + (cartPulse ? " cart-button--pulse" : "")
                  }
                  onClick={onCartClick}
                >
                  <span className="cart-button__label">Корзина</span>
                  <span className="cart-button__meta">
                    {lineCount > 0 ? formatPrice(totalPrice) : "Пока пусто"}
                  </span>
                  <span className="cart-button__badge">{lineCount}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
