import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router-dom";
import { api } from "./api";
import type { Category, MenuItem, Order, SettingsMap, StatusOption } from "./types";
import { Header } from "./components/Header";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import { CartDrawer } from "./components/CartDrawer";
import { AdminPanel } from "./components/AdminPanel";
import { useAuth } from "./authContext";

type View = "menu" | "profile" | "admin";

type ProductDisplay = {
  key: string;
  category_id: number;
  name: string;
  description?: string | null;
  image_url: string;
  variants: MenuItem[];
  minPrice: number;
};

const AppContent: React.FC = () => {
  const [compactHeader, setCompactHeader] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDisplay | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({
    mode: "login" as "login" | "register",
    name: "",
    login: "",
    password: "",
  });

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const { user, login, register, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentView: View = useMemo(() => {
    if (location.pathname.startsWith("/profile")) return "profile";
    if (location.pathname.startsWith("/admin")) return "admin";
    return "menu";
  }, [location.pathname]);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
    api.getStatuses().then(setStatuses).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoadingMenu(true);
    Promise.all([api.getCategories(), api.getMenu()])
      .then(([cats, items]) => {
        const sortedCats = [...cats].sort((a, b) => a.sort_order - b.sort_order);
        setCategories(sortedCats);
        setMenu(items);
        if (sortedCats.length && activeCategoryId === null) {
          setActiveCategoryId(sortedCats[0].id);
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
    const onScroll = () => setCompactHeader(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (location.pathname === "/auth") {
      setAuthModalOpen(true);
      if (user) {
        navigate("/profile", { replace: true });
      }
    }
    if (location.pathname === "/profile" && !user) {
      setAuthModalOpen(true);
    }
  }, [location.pathname, navigate, user]);

  const productsByCategory = useMemo(() => {
    const grouped: Record<string, ProductDisplay> = {};
    for (const item of menu) {
      const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, "");
      const key = `${item.category_id}|${baseName}`;
      if (!grouped[key]) {
        grouped[key] = {
          key,
          category_id: item.category_id,
          name: baseName,
          description: item.description,
          image_url: item.image_url,
          variants: [],
          minPrice: item.price,
        };
      }
      grouped[key].variants.push(item);
      grouped[key].minPrice = Math.min(grouped[key].minPrice, item.price);
    }

    const byCat: Record<number, ProductDisplay[]> = {};
    Object.values(grouped).forEach((p) => {
      p.variants.sort((a, b) => a.price - b.price);
      if (!byCat[p.category_id]) byCat[p.category_id] = [];
      byCat[p.category_id].push(p);
    });

    Object.values(byCat).forEach((arr) =>
      arr.sort((a, b) => a.name.localeCompare(b.name))
    );

    return byCat;
  }, [menu]);

  const handleCategoryClick = (id: number) => {
    setActiveCategoryId(id);
    const el = sectionRefs.current[id];
    if (el) {
      const offset = 90;
      const rect = el.getBoundingClientRect();
      const top = window.scrollY + rect.top - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const openAuth = (mode: "login" | "register" = "login") => {
    setAuthForm((f) => ({ ...f, mode }));
    setAuthError(null);
    setAuthModalOpen(true);
  };

  const closeAuth = () => {
    setAuthModalOpen(false);
    if (location.pathname === "/auth") {
      navigate("/", { replace: true });
    }
  };

  const handleAuthSubmit = async () => {
    if (!authForm.login.trim() || !authForm.password.trim()) {
      setAuthError("Введите логин и пароль");
      return;
    }
    setAuthError(null);
    try {
      if (authForm.mode === "login") {
        await login(authForm.login.trim(), authForm.password);
      } else {
        await register(authForm.name.trim() || "Гость", authForm.login.trim(), authForm.password);
      }
      setAuthForm((f) => ({ ...f, password: "" }));
      setAuthModalOpen(false);
      navigate("/profile");
    } catch (e: any) {
      setAuthError(e.message || "Не удалось авторизоваться");
    }
  };

  const handleTrackFromCart = (_orderId: number, phone: string) => {
    setCartOpen(false);
    setAuthForm((f) => ({ ...f, login: phone }));
    navigate("/profile");
    if (user) {
      api.getMyOrders().then(setMyOrders).catch(() => undefined);
    }
  };

  const heroTitle = settings.hero_title || "Meat Point";
  const heroSubtitle =
    settings.hero_subtitle ||
    "Тёплые блюда и десерты с быстрой доставкой по городу.";

  const OrdersPanel = (
    <section className="panel orders-panel">
      <div className="panel__header">
        <div>
          <h2>История заказов</h2>
          <p className="muted">Все покупки и статусы в одном месте.</p>
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
        <div className="muted">Заказов пока нет.</div>
      )}

      <div className="orders-list">
        {myOrders.map((order) => (
          <div key={order.id} className="order-card order-card--profile">
            <div className="order-card__top">
              <div>
                <div className="order-card__id">Ваш заказ №{order.id}</div>
                <div className="order-card__meta">
                  {order.status_name} · {new Date(order.created_at).toLocaleString()}
                </div>
              </div>
              <div className="order-card__sum">{order.total_price} руб.</div>
            </div>

            <div className="order-card__table">
              <div className="order-card__table-head">
                <span>Наименование</span>
                <span>Шт.</span>
                <span className="align-right">Сумма</span>
              </div>
              {order.items.map((item) => (
                <div key={item.product_size_id} className="order-card__table-row">
                  <span>{item.product_name}</span>
                  <span>{item.quantity}</span>
                  <span className="align-right">{item.line_total} руб.</span>
                </div>
              ))}
              <div className="order-card__table-row order-card__table-row--total">
                <span>Итого</span>
                <span />
                <span className="align-right">{order.total_price} руб.</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const MenuPanel = (
    <section className="menu-section">
      <div className="section-header">
        <h2 className="section-title">Меню</h2>
      </div>

      {loadingMenu && <p className="loading">Загружаем блюда...</p>}

      {!loadingMenu &&
        categories.map((cat) => {
          const items = productsByCategory[cat.id] || [];
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
                    key={product.key}
                    product={product}
                    onClick={() => setSelectedProduct(product)}
                  />
                ))}
              </div>
            </section>
          );
        })}
    </section>
  );

  return (
    <div className="app">
      <Header
        activeView={currentView}
        onChange={(v) => {
          const map: Record<View, string> = {
            menu: "/",
            profile: "/profile",
            admin: "/admin",
          };
          navigate(map[v]);
        }}
        onCartClick={() => setCartOpen(true)}
        user={user}
        onLogout={logout}
        categories={categories}
        activeCategoryId={activeCategoryId ?? undefined}
        onCategoryChange={handleCategoryClick}
        compact={compactHeader}
        onAuthOpen={() => openAuth("login")}
      />

      <main className="main">
        {currentView === "menu" && (
          <section className="hero">
            <div>
              <p className="hero__eyebrow">Доставка любимой еды</p>
              <h1 className="hero__title">{heroTitle}</h1>
              <p className="hero__subtitle">{heroSubtitle}</p>
              <div className="hero__actions">
                <button className="btn btn--primary" onClick={() => navigate("/")}>
                  Посмотреть меню
                </button>
                {!user && (
                  <button
                    className="btn btn--outline"
                    onClick={() => openAuth("register")}
                  >
                    Зарегистрироваться
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
        )}

        <Routes>
          <Route path="/" element={MenuPanel} />
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route
            path="/profile"
            element={
              user ? (
                OrdersPanel
              ) : (
                <div className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Войдите в профиль</h2>
                      <p className="muted">
                        История заказов появится после авторизации.
                      </p>
                    </div>
                    <button className="btn btn--primary" onClick={() => openAuth("login")}>
                      Войти
                    </button>
                  </div>
                </div>
              )
            }
          />
          <Route
            path="/admin"
            element={
              user?.is_admin ? (
                <section className="panel">
                  <AdminPanel statuses={statuses} />
                </section>
              ) : (
                <div className="panel">
                  <div className="alert">
                    Доступ в админку есть только у администраторов.
                  </div>
                </div>
              )
            }
          />
        </Routes>
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

      {authModalOpen && (
        <div className="modal-backdrop" onClick={closeAuth}>
          <div
            className="modal auth-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal__close" onClick={closeAuth}>
              ×
            </button>
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
                placeholder="Логин"
                value={authForm.login}
                onChange={(e) =>
                  setAuthForm((f) => ({ ...f, login: e.target.value }))
                }
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
              <button
                className="btn btn--primary btn--full"
                onClick={handleAuthSubmit}
              >
                {authForm.mode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer__content">
          <span>Meat Point</span>
          {settings.contact_phone && <span>{settings.contact_phone}</span>}
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AppContent />
  </BrowserRouter>
);

export default App;
