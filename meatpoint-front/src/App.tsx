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
  const [authClosing, setAuthClosing] = useState(false);
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
    firstName: "",
    login: "",
    password: "",
  });
  const passwordStrong = useMemo(
    () => /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(authForm.password),
    [authForm.password]
  );
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    gender: "",
  });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const { user, login, register, logout, refresh, loading } = useAuth();
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
    if (!user) return;
    setProfileForm({
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      birthDate: user.birth_date || "",
      gender: user.gender || "",
    });
  }, [user]);

  useEffect(() => {
    const onScroll = () => setCompactHeader(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Подсветка категории при скролле
  useEffect(() => {
    if (!categories.length) return;
    const offset = 120;
    const handleScroll = () => {
      let bestId: number | null = categories[0]?.id ?? null;
      let bestDelta = Number.POSITIVE_INFINITY;
      categories.forEach((cat) => {
        const el = sectionRefs.current[cat.id];
        if (!el) return;
        const top = el.getBoundingClientRect().top - offset;
        const delta = Math.abs(top);
        // берем секцию, которая ближе всего к верхней границе и уже достигла её
        if (top <= 0 && delta < bestDelta) {
          bestDelta = delta;
          bestId = cat.id;
        }
      });
      if (bestId !== null) {
        setActiveCategoryId((prev) => (prev === bestId ? prev : bestId));
      }
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categories]);

  useEffect(() => {
    if (loading) return;
    if (location.pathname === "/auth") {
      setAuthClosing(false);
      setAuthModalOpen(true);
      if (user) {
        navigate("/profile", { replace: true });
      }
    }
    if (location.pathname === "/profile" && !user) {
      setAuthClosing(false);
      setAuthModalOpen(true);
    }
  }, [location.pathname, navigate, user, loading]);

  const productsByCategory = useMemo(() => {
    const grouped: Record<string, ProductDisplay> = {};
    for (const item of menu) {
      const baseName =
        (item.product_name && item.product_name.trim()) ||
        item.name.replace(/\s*\([^)]*\)\s*$/, "");
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
    setAuthClosing(false);
    setAuthModalOpen(true);
  };

  const closeAuth = () => {
    setAuthClosing(true);
    setTimeout(() => {
      setAuthModalOpen(false);
      if (location.pathname === "/auth") {
        navigate("/", { replace: true });
      }
    }, 180);
  };

  const handleAuthSubmit = async () => {
    const loginValue = authForm.login.trim();
    const passwordValue = authForm.password;
    if (!loginValue || !passwordValue) {
      setAuthError("Введите логин и пароль.");
      return;
    }
    if (authForm.mode === "register") {
      const firstName = authForm.firstName.trim();
      if (!firstName) {
        setAuthError("Введите имя.");
        return;
      }
      if (!passwordStrong) {
        setAuthError(
          "Пароль должен быть не короче 8 символов и содержать заглавную букву и цифру."
        );
        return;
      }
    }
    setAuthError(null);
    try {
      if (authForm.mode === "login") {
        await login(loginValue, passwordValue);
      } else {
        await register(
          authForm.firstName.trim(),
          loginValue,
          passwordValue
        );
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

  const formatPrice = (value: number) =>
    `${value.toLocaleString("ru-RU")} ₽`;

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  const heroTitle = settings.hero_title || "Meat Point";
  const heroSubtitle =
    settings.hero_subtitle ||
    "Тёплые блюда и десерты с быстрой доставкой по городу.";
  const handleProfileSave = async () => {
    setProfileError(null);
    setProfileStatus(null);
    setProfileSaving(true);
    try {
      await api.updateProfile({
        first_name: profileForm.firstName.trim() || null,
        last_name: profileForm.lastName.trim() || null,
        birth_date: profileForm.birthDate || null,
        gender: profileForm.gender || null,
      });
      await refresh();
      setProfileStatus("Данные сохранены");
    } catch (e: any) {
      setProfileError(e.message || "Не удалось сохранить данные");
    } finally {
      setProfileSaving(false);
    }
  };

  const renderOrderCard = (order: Order) => {
    const thumbs = order.items
      .map((item) => item.image_url)
      .filter(Boolean)
      .slice(0, 3) as string[];
    const deliveryLabel =
      order.delivery_method === "pickup"
        ? "Самовывоз"
        : order.delivery_method === "delivery"
        ? "Доставка"
        : order.customer_address
        ? "Доставка"
        : "Самовывоз";

    return (
      <div key={order.id} className="order-card order-card--profile">
        <div className="order-card__header">
          <div>
            <div className="order-card__label">Ваш заказ:</div>
            <div className="order-card__title">№{order.id}</div>
            <div className="order-card__meta">
              {deliveryLabel} · {formatDateTime(order.created_at)}
            </div>
          </div>
          <div className="order-card__header-meta">
            {thumbs.length > 0 && (
              <div className="order-card__thumbs">
                {thumbs.map((src, idx) => (
                  <span
                    key={idx}
                    className="order-card__thumb"
                    style={{ backgroundImage: `url(${src})` }}
                  />
                ))}
              </div>
            )}
            <div className="order-card__sum">{formatPrice(order.total_price)}</div>
          </div>
        </div>

        <div className="order-card__table order-card__table--modern">
          <div className="order-card__table-head">
            <span>Наименование</span>
            <span>Кол-во</span>
            <span className="align-right">Сумма</span>
          </div>
          {order.items.map((item) => (
            <div key={item.product_size_id} className="order-card__table-row">
              <span>{item.product_name}</span>
              <span>{item.quantity}</span>
              <span className="align-right">{formatPrice(item.line_total)}</span>
            </div>
          ))}
        </div>

        <div className="order-card__summary">
          <div className="order-card__summary-row">
            <span>Сумма заказа</span>
            <span>{formatPrice(order.total_price)}</span>
          </div>
          <div className="order-card__summary-row order-card__summary-row--total">
            <span>Итого</span>
            <span>{formatPrice(order.total_price)}</span>
          </div>
        </div>
      </div>
    );
  };

  const ProfilePanel = (
    <section className="profile-page">
      <div className="profile-page__header">
        <h1>Личный кабинет</h1>
      </div>

      <div className="profile-page__grid">
        <div className="profile-card profile-card--data">
          <h3>Личные данные</h3>
          <p className="muted">Обновите информацию о себе, чтобы курьер смог связаться с вами.</p>
          <div className="profile-form">
            <label className="profile-form__label">Логин</label>
            <input className="input" value={user?.login || ""} disabled />

            <label className="profile-form__label">Имя</label>
            <input
              className="input"
              value={profileForm.firstName}
              onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
            />

            <label className="profile-form__label">Фамилия (необязательно)</label>
            <input
              className="input"
              value={profileForm.lastName}
              onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
            />

            <label className="profile-form__label">Дата рождения</label>
            <input
              className="input"
              type="date"
              value={profileForm.birthDate || ""}
              onChange={(e) => setProfileForm((f) => ({ ...f, birthDate: e.target.value }))}
            />

            <label className="profile-form__label">Пол</label>
            <select
              className="input"
              value={profileForm.gender}
              onChange={(e) => setProfileForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">Не выбрано</option>
              <option value="Мужской">Мужской</option>
              <option value="Женский">Женский</option>
              <option value="Другое">Другое</option>
            </select>
          </div>
          {profileStatus && <div className="alert alert--success">{profileStatus}</div>}
          {profileError && <div className="alert alert--error">{profileError}</div>}
          <button className="btn btn--primary" onClick={handleProfileSave} disabled={profileSaving}>
            {profileSaving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>

        <div className="profile-card profile-card--orders">
          <div className="profile-card__header">
            <h3>История заказов</h3>
            <button
              className="btn btn--outline"
              onClick={() => api.getMyOrders().then(setMyOrders)}
            >
              Обновить
            </button>
          </div>

          {ordersLoading && <div className="muted">Загружаем заказы...</div>}
          {!ordersLoading && myOrders.length === 0 && (
            <div className="muted">У вас пока нет заказов.</div>
          )}

          <div className="orders-list orders-list--modern">
            {myOrders.map((order) => renderOrderCard(order))}
          </div>
        </div>
      </div>
    </section>
  );
  const MenuPanel = (
    <section className="menu-section">
      <div className="section-header">
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
                ProfilePanel
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
            path="/admin/*"
            element={
              user?.is_admin ? (
                <AdminPanel statuses={statuses} />
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
        <div
          className="modal-backdrop"
          data-leave={authClosing ? "true" : undefined}
          onClick={closeAuth}
        >
          <div
            className="modal auth-modal"
            data-leave={authClosing ? "true" : undefined}
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
                  onClick={() => {
                    setAuthError(null);
                    setAuthForm((f) => ({ ...f, mode: "login" }));
                  }}
                >
                  Вход
                </button>
                <button
                  className={
                    "auth-tab" + (authForm.mode === "register" ? " auth-tab--active" : "")
                  }
                  onClick={() => {
                    setAuthError(null);
                    setAuthForm((f) => ({ ...f, mode: "register" }));
                  }}
                >
                  Регистрация
                </button>
              </div>
              {authForm.mode === "register" && (
                <input
                  className="input"
                  placeholder="Имя"
                  value={authForm.firstName}
                  onChange={(e) =>
                    setAuthForm((f) => ({ ...f, firstName: e.target.value }))
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
              <div className="muted" style={{ fontSize: "12px" }}>
                Пароль: минимум 8 символов, одна заглавная буква и одна цифра.
              </div>
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

