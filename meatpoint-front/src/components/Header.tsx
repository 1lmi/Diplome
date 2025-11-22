import React from "react";
import { useCart } from "../cartContext";
import { CategoryTabs } from "./CategoryTabs";
import type { User, Category } from "../types";

interface Props {
  activeView: "menu" | "profile" | "admin";
  onChange: (view: Props["activeView"]) => void;
  onCartClick: () => void;
  user: User | null;
  onLogout: () => void;
  onAuthOpen: () => void;
  categories: Category[];
  activeCategoryId?: number;
  onCategoryChange: (id: number) => void;
  compact: boolean;
}

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
  const { totalCount, totalPrice } = useCart();

  return (
    <header className={"header" + (compact ? " header--compact" : "")}>
      <div className="header__inner">
        <div className="header__row">
          <div className="header__cluster">
            <div className="logo">Meat&nbsp;Point</div>
            <div className="header__categories">
              <CategoryTabs
                categories={categories}
                activeId={activeCategoryId}
                onChange={onCategoryChange}
              />
            </div>
          </div>

          <div className="header__actions">
            {user ? (
              <>
                <button
                  className={
                    "nav__link" + (activeView === "profile" ? " nav__link--active" : "")
                  }
                  onClick={() => onChange("profile")}
                >
                  Профиль
                </button>
                {user?.is_admin && (
                  <button
                    className={
                      "nav__link" + (activeView === "admin" ? " nav__link--active" : "")
                    }
                    onClick={() => onChange("admin")}
                  >
                    Админка
                  </button>
                )}
                <button className="link-btn" onClick={onLogout}>
                  Выйти
                </button>
              </>
            ) : (
              <button className="link-btn" onClick={onAuthOpen}>
                Вход / Регистрация
              </button>
            )}
            <button className="cart-button" onClick={onCartClick}>
              <span className="cart-button__price">
                {totalPrice ? `${totalPrice} руб.` : "Корзина"}
              </span>
              <span className="cart-button__divider" />
              <span className="cart-button__count">
                {totalCount ? `${totalCount} поз.` : "Пусто"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
