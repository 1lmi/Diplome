import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type {
  Category,
  MenuItem,
  Order,
  SettingsMap,
  StatusOption,
} from "./types";
import { Header } from "./components/Header";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import { CartDrawer } from "./components/CartDrawer";
import { AdminPanel } from "./components/AdminPanel";
import { useCart } from "./cartContext";
import { useAuth } from "./authContext";

type View = "menu" | "orders" | "admin" | "auth";

const App: React.FC = () => {
  const [compactHeader, setCompactHeader] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [view, setView] = useState<View>("menu");
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState<{
    mode: "login" | "register";
    name: string;
    phone: string;
    password: string;
  }>({
    mode: "login",
    name: "",
    phone: "",
    password: "",
  });

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const { addProduct } = useCart();
  const { user, login, register, logout } = useAuth();

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
    api.getStatuses().then(setStatuses).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoadingMenu(true);
    Promise.all([api.getCategories(), api.getMenu()])
      .then(([cats, items]) => {
        setCategories(cats);
        setMenu(items);
        if (cats.length && activeCategoryId === null) {
          setActiveCategoryId(cats[0].id);
        }
      })
      .finally(() => setLoadingMenu(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setMyOrders([]);
      return;
    }
    setOrdersLoading(true);
    api
      .getMyOrders()
      .then(setMyOrders)
      .catch(() => setMyOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [user]);

  useEffect(() => {
    const onScroll = () => {
      setCompactHeader(window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const menuByCategory = useMemo(() => {
    const result: Record<number, MenuItem[]> = {};
    for (const item of menu) {
      if (!result[item.category_id]) {
        result[item.category_id] = [];
      }
      result[item.category_id].push(item);
    }
    Object.values(result).forEach((arr) =>
      arr.sort((a, b) => a.name.localeCompare(b.name))
    );
    return result;
  }, [menu]);

  const handleCategoryClick = (id: number) => {
    setActiveCategoryId(id);
    const el = sectionRefs.current[id];
    if (el) {
      const headerOffset = 80;
      const rect = el.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top - headerOffset;
      window.scrollTo({ top: scrollTop, behavior: "smooth" });
    }
  };

  const handleAuthSubmit = async () => {
    if (!authForm.phone || !authForm.password) return;
    setAuthError(null);
    try {
      if (authForm.mode === "login") {
        await login(authForm.phone, authForm.password);
      } else {
        await register(authForm.name || "Гость", authForm.phone, authForm.password);
      }
      setAuthForm((f) => ({ ...f, password: "" }));
      setView("orders");
    } catch (e: any) {
      setAuthError(e.message);
    }
  };

  const handleTrackFromCart = (_orderId: number, phone: string) => {
    setView("orders");
    setCartOpen(false);
    setAuthForm((f) => ({ ...f, phone }));
    if (user) {
      api.getMyOrders().then(setMyOrders).catch(() => undefined);
    }
  };

  const heroTitle = settings.hero_title || "Meat Point";
  const heroSubtitle =
    settings.hero_subtitle || "Стейки, закуски и десерты к вашему столу.";

  const renderOrders = () => {
    if (!user) {
      return (
        <section className="panel">
          <h2>Войдите, чтобы посмотреть свои заказы</h2>
          <p className="muted">
            Авторизация сохранит ваш номер и ускорит следующее оформление.
          </p>
          {renderAuthForm()}
        </section>
      );
    }
    return (
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Мои заказы</h2>
            <p className="muted">Статусы обновляются в реальном времени.</p>
          </div>
          <button
            className="btn btn--outline"
            onClick={() => api.getMyOrders().then(setMyOrders)}
          >
            Обновить
          </button>
        </div>
        {ordersLoading && <div className="muted">Загружаем заказы...</div>}
        {!ordersLoading && myOrders.length === 0 && (
          <div className="muted">Вы ещё ничего не заказывали.</div>
        )}
        <div className="stack gap-6">
          {myOrders.map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-card__header">
                <div>
                  <div className="order-card__id">Заказ №{order.id}</div>
                  <div className="order-card__status">{order.status_name}</div>
                </div>
                <div className="order-card__sum">{order.total_price} ₽</div>
              </div>
              <div className="timeline">
                {(order.history || []).map((step) => (
                  <div key={step.changed_at + step.status} className="timeline__item">
                    <div className="timeline__dot" />
                    <div className="timeline__content">
                      <div className="timeline__title">{step.status_name}</div>
                      <div className="timeline__meta">
                        {new Date(step.changed_at).toLocaleString()}
                        {step.comment ? ` · ${step.comment}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderAuthForm = () => (
    <div className="auth-box">
      <div className="auth-box__tabs">
        <button
          className={
            "auth-tab" + (authForm.mode === "login" ? " auth-tab--active" : "")
          }
          onClick={() => setAuthForm((f) => ({ ...f, mode: "login" }))}
        >
          Вход
        </button>
        <button
          className={
            "auth-tab" + (authForm.mode === "register" ? " auth-tab--active" : "")
          }
          onClick={() => setAuthForm((f) => ({ ...f, mode: "register" }))}
        >
          Регистрация
        </button>
      </div>
      {authForm.mode === "register" && (
        <input
          className="input"
          placeholder="Имя"
          value={authForm.name}
          onChange={(e) =>
            setAuthForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      )}
      <input
        className="input"
        placeholder="Телефон"
        value={authForm.phone}
        onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))}
      />
      <input
        className="input"
        type="password"
        placeholder="Пароль"
        value={authForm.password}
        onChange={(e) =>
          setAuthForm((f) => ({ ...f, password: e.target.value }))
        }
      />
      {authError && <div className="alert alert--error">{authError}</div>}
      <button className="btn btn--primary btn--full" onClick={handleAuthSubmit}>
        {authForm.mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </div>
  );

  return (
    <div className="app">
      <Header
        activeView={view}
        onChange={(v) => setView(v)}
        onCartClick={() => setCartOpen(true)}
        user={user}
        onLogout={logout}
        categories={categories}
        activeCategoryId={activeCategoryId ?? undefined}
        onCategoryChange={handleCategoryClick}
        compact={compactHeader}
      />

      <main className="main">
        <section className="hero">
          <div>
            <p className="hero__eyebrow">Современная доставка стейкхауса</p>
            <h1 className="hero__title">{heroTitle}</h1>
            <p className="hero__subtitle">{heroSubtitle}</p>
            <div className="hero__actions">
              <button className="btn btn--primary" onClick={() => setView("menu")}>
                Перейти к меню
              </button>
              {!user && (
                <button className="btn btn--outline" onClick={() => setView("auth")}>
                  Войти или зарегистрироваться
                </button>
              )}
            </div>
            {settings.contact_phone && (
              <div className="hero__contact">Телефон: {settings.contact_phone}</div>
            )}
            {settings.delivery_hint && (
              <div className="hero__hint">{settings.delivery_hint}</div>
            )}
          </div>
        </section>

        {view === "auth" && !user && (
          <section className="panel">
            <div className="panel__header">
              <div>
                <h2>Профиль</h2>
                <p className="muted">
                  Войдите или зарегистрируйтесь, чтобы привязать заказы к аккаунту и
                  видеть статусы в профиле.
                </p>
              </div>
            </div>
            {renderAuthForm()}
          </section>
        )}

        {view === "menu" && (
          <section className="menu-section">
            <div className="section-header">
              <h2 className="section-title">Меню</h2>
            </div>

            {loadingMenu && <p className="loading">Загружаем меню...</p>}

            {!loadingMenu &&
              categories.map((cat) => {
                const items = menuByCategory[cat.id] || [];
                if (!items.length) return null;

                return (
                  <section
                    key={cat.id}
                    className="menu-category-section"
                    ref={(el) => {
                      sectionRefs.current[cat.id] = el;
                    }}
                  >
                    <h3 className="menu-category-title" id={`cat-${cat.id}`}>
                      {cat.name}
                    </h3>
                    <div className="product-grid">
                      {items.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onClick={() => setSelectedProduct(product)}
                          onAdd={() => addProduct(product)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
          </section>
        )}

        {view === "orders" && renderOrders()}

        {view === "admin" && (
          <section className="panel">
            {user?.is_admin ? (
              <AdminPanel statuses={statuses} />
            ) : (
              <div className="alert">
                Администрирование доступно только пользователям с правами.
              </div>
            )}
          </section>
        )}
      </main>

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onTrack={handleTrackFromCart}
      />

      <footer className="footer">
        <div className="footer__content">
          <span>Meat Point</span>
          {settings.contact_phone && <span>{settings.contact_phone}</span>}
        </div>
      </footer>
    </div>
  );
};

export default App;
