import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./authContext";
import { AdminPanel } from "./components/AdminPanel";
import { Header } from "./components/Header";
import OrderDetailsPage from "./components/OrderDetailsPage";
import ProfilePage from "./components/ProfilePage";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import CartPage from "./components/cart/CartPage";
import CheckoutFlowHeader from "./components/cart/CheckoutFlowHeader";
import CheckoutPage from "./components/cart/CheckoutPage";
import CheckoutSuccessPage from "./components/cart/CheckoutSuccessPage";
import type {
  Category,
  MenuItem,
  Order,
  ProductDisplay,
  SettingsMap,
  StatusOption,
  UserAddress,
} from "./types";

type View = "menu" | "profile" | "admin" | "checkout";

const AppContent: React.FC = () => {
  const [compactHeader, setCompactHeader] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authClosing, setAuthClosing] = useState(false);
  const [authReturnTo, setAuthReturnTo] = useState("/profile");
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDisplay | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [myAddresses, setMyAddresses] = useState<UserAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
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

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const { user, login, register, logout, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentView: View = useMemo(() => {
    if (
      location.pathname.startsWith("/cart") ||
      location.pathname.startsWith("/checkout")
    ) {
      return "checkout";
    }
    if (location.pathname.startsWith("/profile")) return "profile";
    if (location.pathname.startsWith("/orders")) return "profile";
    if (location.pathname.startsWith("/admin")) return "admin";
    return "menu";
  }, [location.pathname]);

  const checkoutStep = useMemo<1 | 2 | 3 | null>(() => {
    if (location.pathname.startsWith("/checkout/success/")) return 3;
    if (location.pathname.startsWith("/checkout")) return 2;
    if (location.pathname.startsWith("/cart")) return 1;
    return null;
  }, [location.pathname]);

  const checkoutUtility = useMemo(() => {
    const successMatch = location.pathname.match(/^\/checkout\/success\/(\d+)/);
    if (successMatch) {
      return {
        href: `/orders/${successMatch[1]}`,
        label: "К заказу",
      };
    }

    return {
      href: "/",
      label: "В меню",
    };
  }, [location.pathname]);

  const refreshMyOrders = async () => {
    setOrdersLoading(true);
    try {
      const orders = await api.getMyOrders();
      setMyOrders(orders);
    } catch {
      setMyOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const refreshMyAddresses = async () => {
    setAddressesLoading(true);
    try {
      const addresses = await api.getMyAddresses();
      setMyAddresses(addresses);
    } catch {
      setMyAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  };

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
    api.getStatuses().then(setStatuses).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoadingMenu(true);
    Promise.all([api.getCategories(), api.getMenu()])
      .then(([cats, items]) => {
        const sortedCategories = [...cats].sort((a, b) => a.sort_order - b.sort_order);
        setCategories(sortedCategories);
        setMenu(items);
        if (sortedCategories.length && activeCategoryId === null) {
          setActiveCategoryId(sortedCategories[0].id);
        }
      })
      .finally(() => setLoadingMenu(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setMyOrders([]);
      setMyAddresses([]);
      return;
    }

    void Promise.all([refreshMyOrders(), refreshMyAddresses()]);
  }, [user]);

  useEffect(() => {
    const onScroll = () => setCompactHeader(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!categories.length) return;

    const offset = 120;
    const handleScroll = () => {
      let bestId: number | null = categories[0]?.id ?? null;
      let bestDelta = Number.POSITIVE_INFINITY;

      categories.forEach((category) => {
        const element = sectionRefs.current[category.id];
        if (!element) return;

        const top = element.getBoundingClientRect().top - offset;
        const delta = Math.abs(top);
        if (top <= 0 && delta < bestDelta) {
          bestDelta = delta;
          bestId = category.id;
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
      if (user) {
        navigate("/profile", { replace: true });
        return;
      }

      setAuthReturnTo("/profile");
      setAuthError(null);
      setAuthClosing(false);
      setAuthForm((prev) => ({ ...prev, mode: "login" }));
      setAuthModalOpen(true);
    }

    if (location.pathname === "/profile" && !user) {
      setAuthReturnTo("/profile");
      setAuthError(null);
      setAuthClosing(false);
      setAuthForm((prev) => ({ ...prev, mode: "login" }));
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

    const byCategory: Record<number, ProductDisplay[]> = {};
    Object.values(grouped).forEach((product) => {
      product.variants.sort((a, b) => a.price - b.price);
      if (!byCategory[product.category_id]) {
        byCategory[product.category_id] = [];
      }
      byCategory[product.category_id].push(product);
    });

    Object.values(byCategory).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name, "ru"))
    );

    return byCategory;
  }, [menu]);

  const allProducts = useMemo(
    () => Object.values(productsByCategory).flat(),
    [productsByCategory]
  );

  const visibleProductCount = useMemo(
    () => allProducts.length,
    [allProducts]
  );

  const handleCategoryClick = (id: number) => {
    setActiveCategoryId(id);
    const element = sectionRefs.current[id];
    if (!element) return;

    const offset = 90;
    const rect = element.getBoundingClientRect();
    const top = window.scrollY + rect.top - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const openAuth = (mode: "login" | "register" = "login", returnTo = "/profile") => {
    setAuthForm((prev) => ({ ...prev, mode }));
    setAuthReturnTo(returnTo);
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
        await register(authForm.firstName.trim(), loginValue, passwordValue);
      }

      setAuthForm((prev) => ({ ...prev, password: "" }));
      setAuthModalOpen(false);
      navigate(authReturnTo);
    } catch (e: any) {
      setAuthError(e?.message || "Не удалось авторизоваться.");
    }
  };

  const heroTitle = settings.hero_title || "Meat Point";
  const heroSubtitle =
    settings.hero_subtitle ||
    "Тёплые блюда и десерты с быстрой доставкой по городу.";

  const menuPanel = (
    <section className="menu-section">
      <div className="section-header">
        <p className="eyebrow">Меню</p>
        <div className="section-header__row">
          <div>
            <h2 className="section-title">Выберите блюдо под настроение</h2>
            <p className="muted section-header__text">
              Откройте карточку блюда, чтобы выбрать размер, посмотреть состав и быстро
              добавить позицию в корзину.
            </p>
          </div>
          <div className="section-header__stat">{visibleProductCount} позиций в меню</div>
        </div>
      </div>

      {loadingMenu ? <p className="loading">Загружаем блюда...</p> : null}

      {!loadingMenu
        ? categories.map((category) => {
            const items = productsByCategory[category.id] || [];
            if (!items.length) return null;

            return (
              <section
                key={category.id}
                className="menu-category-section"
                ref={(element) => {
                  sectionRefs.current[category.id] = element;
                }}
              >
                <h3 className="menu-category-title" id={`cat-${category.id}`}>
                  {category.name}
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
          })
        : null}
    </section>
  );

  return (
    <div className="app">
      {currentView === "checkout" && checkoutStep ? (
        <CheckoutFlowHeader
          step={checkoutStep}
          utilityHref={checkoutUtility.href}
          utilityLabel={checkoutUtility.label}
        />
      ) : (
        <Header
          activeView={currentView}
          onChange={(view) => {
            const map: Record<"menu" | "profile" | "admin", string> = {
              menu: "/",
              profile: "/profile",
              admin: "/admin",
            };
            navigate(map[view]);
          }}
          onCartClick={() => navigate("/cart")}
          user={user}
          onLogout={logout}
          categories={categories}
          activeCategoryId={activeCategoryId ?? undefined}
          onCategoryChange={handleCategoryClick}
          compact={compactHeader}
          onAuthOpen={() => openAuth("login")}
        />
      )}

      <main className={"main" + (currentView === "checkout" ? " main--checkout" : "")}>
        {currentView === "menu" ? (
          <section className="hero">
            <div className="hero__content">
              <p className="hero__eyebrow">Тёплая еда на каждый день</p>
              <h1 className="hero__title">{heroTitle}</h1>
              <p className="hero__subtitle">{heroSubtitle}</p>
              <div className="hero__actions">
                <button className="btn btn--primary" type="button" onClick={() => navigate("/")}>
                  Посмотреть меню
                </button>
                {!user ? (
                  <button
                    className="btn btn--outline"
                    type="button"
                    onClick={() => openAuth("register")}
                  >
                    Зарегистрироваться
                  </button>
                ) : null}
              </div>
              {settings.contact_phone ? (
                <div className="hero__contact">Телефон: {settings.contact_phone}</div>
              ) : null}
              {settings.delivery_hint ? (
                <div className="hero__hint">{settings.delivery_hint}</div>
              ) : null}
            </div>

            <div className="hero__meta">
              <div className="hero__meta-card">
                <p className="hero__meta-title">Быстрый обзор</p>
                <div className="hero__meta-grid">
                  <div className="hero__meta-item">
                    <span className="hero__meta-value">{categories.length}</span>
                    <span className="hero__meta-label">категорий</span>
                  </div>
                  <div className="hero__meta-item">
                    <span className="hero__meta-value">{visibleProductCount}</span>
                    <span className="hero__meta-label">блюд в меню</span>
                  </div>
                </div>
              </div>
              <div className="hero__meta-card">
                <p className="hero__meta-title">Контакты и доставка</p>
                <p className="hero__meta-note">
                  {settings.contact_phone
                    ? `Телефон для связи: ${settings.contact_phone}`
                    : "Телефон появится после настройки витрины в админке."}
                </p>
                <p className="hero__meta-note">
                  {settings.delivery_hint ||
                    "Выберите блюда, откройте корзину и оформите заказ на отдельной странице."}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <Routes>
          <Route path="/" element={menuPanel} />
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route path="/cart" element={<CartPage products={allProducts} onSelectProduct={setSelectedProduct} />} />
          <Route
            path="/checkout"
            element={
              <CheckoutPage
                onLoginRequest={() => openAuth("login", "/checkout")}
                addresses={myAddresses}
                addressesLoading={addressesLoading}
              />
            }
          />
          <Route path="/checkout/success/:orderId" element={<CheckoutSuccessPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
          <Route
            path="/profile"
            element={
              user ? (
                <ProfilePage
                  user={user}
                  orders={myOrders}
                  ordersLoading={ordersLoading}
                  addresses={myAddresses}
                  addressesLoading={addressesLoading}
                  onRefreshOrders={refreshMyOrders}
                  onRefreshAddresses={refreshMyAddresses}
                  onRefreshUser={refresh}
                />
              ) : (
                <div className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Войдите в профиль</h2>
                      <p className="muted">
                        История заказов и личные данные появятся после авторизации.
                      </p>
                    </div>
                    <button className="btn btn--primary" onClick={() => openAuth("login", "/profile")}>
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

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />

      {authModalOpen ? (
        <div
          className="modal-backdrop"
          data-leave={authClosing ? "true" : undefined}
          onClick={closeAuth}
        >
          <div
            className="modal auth-modal"
            data-leave={authClosing ? "true" : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal__close" onClick={closeAuth}>
              ×
            </button>
            <div className="auth-box">
              <div className="auth-box__header">
                <div className="auth-box__title">
                  {authForm.mode === "login" ? "Вход в аккаунт" : "Создать аккаунт"}
                </div>
                <p className="auth-box__text">
                  {authForm.mode === "login"
                    ? "Авторизуйтесь, чтобы видеть историю заказов и оформлять покупки быстрее."
                    : "После регистрации вы сможете быстрее оформлять заказы и отслеживать их статус."}
                </p>
              </div>

              <div className="auth-box__tabs">
                <button
                  type="button"
                  className={"auth-tab" + (authForm.mode === "login" ? " auth-tab--active" : "")}
                  onClick={() => {
                    setAuthError(null);
                    setAuthForm((prev) => ({ ...prev, mode: "login" }));
                  }}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={
                    "auth-tab" + (authForm.mode === "register" ? " auth-tab--active" : "")
                  }
                  onClick={() => {
                    setAuthError(null);
                    setAuthForm((prev) => ({ ...prev, mode: "register" }));
                  }}
                >
                  Регистрация
                </button>
              </div>

              {authForm.mode === "register" ? (
                <input
                  className="input"
                  placeholder="Имя"
                  value={authForm.firstName}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
              ) : null}

              <input
                className="input"
                placeholder="Логин"
                value={authForm.login}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, login: event.target.value }))
                }
              />

              <input
                className="input"
                type="password"
                placeholder="Пароль"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />

              <div className="muted" style={{ fontSize: "12px" }}>
                Пароль: минимум 8 символов, одна заглавная буква и одна цифра.
              </div>
              <p className="auth-box__helper">
                Используйте актуальные данные: это поможет быстрее находить и отслеживать ваши
                заказы.
              </p>

              {authError ? <div className="alert alert--error">{authError}</div> : null}

              <button className="btn btn--primary btn--full" type="button" onClick={handleAuthSubmit}>
                {authForm.mode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="footer">
        <div className="footer__content">
          <span>Meat Point</span>
          {settings.contact_phone ? <span>{settings.contact_phone}</span> : null}
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
