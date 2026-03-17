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
  compact: boolean;
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
  compact,
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
    <header className={"header" + (compact ? " header--compact" : "")}>
      <div className="header__inner">
        <div className="header__top">
          <button className="header__brand" type="button" onClick={() => onChange("menu")}>
            <span className="header__brand-mark">MP</span>
            <span className="header__brand-copy">
              <span className="header__brand-title">Meat Point</span>
              <span className="header__brand-subtitle">Доставка еды без лишних шагов</span>
            </span>
          </button>

          <div className="header__actions">
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
                  {user.is_admin ? (
                    <button
                      type="button"
                      className={
                        "nav__link" + (activeView === "admin" ? " nav__link--active" : "")
                      }
                      onClick={() => onChange("admin")}
                    >
                      Админка
                    </button>
                  ) : null}
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
              <span className="cart-button__badge">{lineCount} поз.</span>
            </button>
          </div>
        </div>

        {showCategories ? (
          <div className="header__categories">
            <CategoryTabs
              categories={categories}
              activeId={activeCategoryId}
              onChange={onCategoryChange}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
};
