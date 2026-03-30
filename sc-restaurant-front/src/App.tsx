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
import { parseHomeBanners } from "./bannerSettings";
import {
  formatPhoneInput,
  isCompletePhoneInput,
  normalizePhoneLogin,
} from "./phone";
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
const getHeaderOffset = () =>
  document.querySelector(".header")?.getBoundingClientRect().height ?? 118;

const buildCarouselBanners = (banners: ReturnType<typeof parseHomeBanners>) => {
  const makeCopy = (copyIndex: -1 | 0 | 1, prefix: string) =>
    banners.map((banner, index) => ({
      ...banner,
      renderKey: `${prefix}-${banner.id}-${index}`,
      sourceIndex: index,
      copyIndex,
    }));

  const middle = makeCopy(0, "middle");
  if (middle.length <= 1) {
    return middle;
  }

  return [
    ...makeCopy(-1, "prev"),
    ...middle,
    ...makeCopy(1, "next"),
  ];
};

const AppContent: React.FC = () => {
  const [activeSlide, setActiveSlide] = useState(0);
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

  const homeBanners = useMemo(
    () =>
      parseHomeBanners(settings.hero_banners, {
        fallbackToDefaults: true,
      }),
    [settings.hero_banners]
  );
  const carouselBanners = useMemo(() => buildCarouselBanners(homeBanners), [homeBanners]);

  const passwordValid = useMemo(
    () => authForm.password.trim().length >= 6,
    [authForm.password]
  );

  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const carouselViewportRef = useRef<HTMLDivElement | null>(null);
  const carouselSlideRefs = useRef<Record<string, HTMLElement | null>>({});
  const pendingCarouselTargetRef = useRef<number | null>(null);
  const pendingCarouselSettleRef = useRef<number | null>(null);
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
    if (!categories.length) return;
    const handleScroll = () => {
      const offset = getHeaderOffset() + 18;
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
    if (!homeBanners.length) {
      setActiveSlide(0);
      return;
    }
    setActiveSlide((prev) => Math.min(prev, homeBanners.length - 1));
  }, [homeBanners]);

  const getRenderedIndexForActual = (index: number) => {
    if (homeBanners.length <= 1) return index;
    return homeBanners.length + index;
  };

  const getCarouselTargetLeft = (renderedIndex: number) => {
    const viewport = carouselViewportRef.current;
    const banner = carouselBanners[renderedIndex];
    if (!viewport || !banner) return null;

    const slide = carouselSlideRefs.current[banner.renderKey];
    if (!slide) return null;

    return Math.max(
      0,
      slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2
    );
  };

  const scrollCarouselToIndex = (
    actualIndex: number,
    behavior: ScrollBehavior = "smooth",
    lockScrollSync = false,
    overrideRenderedIndex?: number,
    settleActualIndex?: number | null
  ) => {
    const viewport = carouselViewportRef.current;
    const renderedIndex = overrideRenderedIndex ?? getRenderedIndexForActual(actualIndex);
    const targetLeft = getCarouselTargetLeft(renderedIndex);
    if (!viewport || targetLeft === null) return;

    if (lockScrollSync) {
      pendingCarouselTargetRef.current = renderedIndex;
      pendingCarouselSettleRef.current = settleActualIndex ?? null;
    }

    viewport.scrollTo({
      left: targetLeft,
      behavior,
    });
  };

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      scrollCarouselToIndex(activeSlide, "auto");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [homeBanners.length, carouselBanners.length]);

  useEffect(() => {
    const handleResize = () => {
      scrollCarouselToIndex(activeSlide, "auto");
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeSlide, homeBanners]);

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
    const grouped = new Map<string, ProductDisplay>();

    for (const item of menu) {
      const baseName =
        (item.product_name && item.product_name.trim()) ||
        item.name.replace(/\s*\([^)]*\)\s*$/, "");
      const key = `${item.category_id}|${baseName}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          category_id: item.category_id,
          name: baseName,
          description: item.description,
          image_url: item.image_url,
          variants: [],
          minPrice: item.price,
        });
      }

      const entry = grouped.get(key)!;
      entry.variants.push(item);
      entry.minPrice = Math.min(entry.minPrice, item.price);
    }

    const byCategory: Record<number, ProductDisplay[]> = {};
    grouped.forEach((product) => {
      product.variants.sort((a, b) => a.price - b.price);
      if (!byCategory[product.category_id]) {
        byCategory[product.category_id] = [];
      }
      byCategory[product.category_id].push(product);
    });

    return byCategory;
  }, [menu]);

  const allProducts = useMemo(
    () => Object.values(productsByCategory).flat(),
    [productsByCategory]
  );


  const handleCategoryClick = (id: number) => {
    setActiveCategoryId(id);
    const element = sectionRefs.current[id];
    if (!element) return;

    const offset = getHeaderOffset() + 18;
    const rect = element.getBoundingClientRect();
    const top = window.scrollY + rect.top - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const showPrevSlide = () => {
    if (!homeBanners.length) return;
    setActiveSlide((prev) => {
      const next = prev === 0 ? homeBanners.length - 1 : prev - 1;
      if (homeBanners.length > 1 && prev === 0) {
        scrollCarouselToIndex(next, "smooth", true, homeBanners.length - 1, next);
      } else {
        scrollCarouselToIndex(next, "smooth", true);
      }
      return next;
    });
  };

  const showNextSlide = () => {
    if (!homeBanners.length) return;
    setActiveSlide((prev) => {
      const next = (prev + 1) % homeBanners.length;
      if (homeBanners.length > 1 && prev === homeBanners.length - 1) {
        scrollCarouselToIndex(next, "smooth", true, homeBanners.length * 2, next);
      } else {
        scrollCarouselToIndex(next, "smooth", true);
      }
      return next;
    });
  };

  const handleCarouselScroll = () => {
    const viewport = carouselViewportRef.current;
    if (!viewport || !homeBanners.length) return;

    const pendingIndex = pendingCarouselTargetRef.current;
    if (pendingIndex !== null) {
      const pendingLeft = getCarouselTargetLeft(pendingIndex);
      if (pendingLeft !== null && Math.abs(viewport.scrollLeft - pendingLeft) <= 8) {
        const settleActualIndex = pendingCarouselSettleRef.current;
        pendingCarouselTargetRef.current = null;
        pendingCarouselSettleRef.current = null;
        if (settleActualIndex !== null) {
          window.requestAnimationFrame(() => {
            scrollCarouselToIndex(settleActualIndex, "auto");
          });
        }
      } else {
        return;
      }
    }

    const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;

    carouselBanners.forEach((banner, index) => {
      const slide = carouselSlideRefs.current[banner.renderKey];
      if (!slide) return;
      const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
      const delta = Math.abs(slideCenter - viewportCenter);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });

    const bestBanner = carouselBanners[bestIndex];
    if (!bestBanner) return;

    if (bestBanner.copyIndex !== 0) {
      setActiveSlide((prev) =>
        prev === bestBanner.sourceIndex ? prev : bestBanner.sourceIndex
      );
      window.requestAnimationFrame(() => {
        scrollCarouselToIndex(bestBanner.sourceIndex, "auto");
      });
      return;
    }

    setActiveSlide((prev) =>
      prev === bestBanner.sourceIndex ? prev : bestBanner.sourceIndex
    );
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
    const phoneValue = authForm.login.trim();
    const passwordValue = authForm.password;

    if (!phoneValue || !passwordValue) {
      setAuthError("Введите номер телефона и пароль.");
      return;
    }

    if (!isCompletePhoneInput(phoneValue)) {
      setAuthError("Укажите номер телефона в формате +7 (xxx) xxx-xx-xx.");
      return;
    }

    if (authForm.mode === "register") {
      const firstName = authForm.firstName.trim();
      if (!firstName) {
        setAuthError("Введите имя.");
        return;
      }
      if (!passwordValid) {
        setAuthError("Пароль должен быть не короче 6 символов.");
        return;
      }
    }

    setAuthError(null);
    const loginValue = normalizePhoneLogin(phoneValue);

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


  const menuPanel = (
    <section className="menu-section">
      <section className="placeholder-carousel" aria-label="Промо-блок">
        <button
          className="placeholder-carousel__arrow"
          type="button"
          onClick={showPrevSlide}
          aria-label="Предыдущий слайд"
        >
          ‹
        </button>

        <div
          ref={carouselViewportRef}
          className="placeholder-carousel__viewport"
          onScroll={handleCarouselScroll}
        >
          {carouselBanners.map((slide) => (
            <article
              key={slide.renderKey}
              ref={(element) => {
                carouselSlideRefs.current[slide.renderKey] = element;
              }}
              className={
                "placeholder-carousel__slide placeholder-carousel__slide--" +
                slide.theme +
                (slide.sourceIndex === activeSlide
                  ? " placeholder-carousel__slide--active"
                  : "")
              }
              aria-hidden={slide.sourceIndex !== activeSlide}
            >
              <div className="placeholder-carousel__copy">
                <span className="placeholder-carousel__kicker">{slide.kicker}</span>
                <div>
                  <strong className="placeholder-carousel__title">{slide.title}</strong>
                  <p className="placeholder-carousel__text">{slide.text}</p>
                </div>
              </div>

              <div className="placeholder-carousel__art" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </article>
          ))}
        </div>

        <button
          className="placeholder-carousel__arrow"
          type="button"
          onClick={showNextSlide}
          aria-label="Следующий слайд"
        >
          ›
        </button>

        <div className="placeholder-carousel__dots" aria-label="Навигация по слайдам">
          {homeBanners.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={
                "placeholder-carousel__dot" +
                (index === activeSlide ? " placeholder-carousel__dot--active" : "")
              }
              onClick={() => {
                setActiveSlide(index);
                scrollCarouselToIndex(index, "smooth", true);
              }}
              aria-label={`Слайд ${index + 1}`}
              aria-pressed={index === activeSlide}
            />
          ))}
        </div>
      </section>

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
          onAuthOpen={() => openAuth("login")}
        />
      )}

      <main className={"main" + (currentView === "checkout" ? " main--checkout" : "")}>
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
                onRefreshAddresses={refreshMyAddresses}
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
                inputMode="tel"
                placeholder="+7 (999) 123-45-67"
                value={authForm.login}
                onChange={(event) =>
                  setAuthForm((prev) => ({
                    ...prev,
                    login: formatPhoneInput(event.target.value),
                  }))
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
                Номер телефона нужен для входа. Пароль: минимум 6 символов.
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
          <span>SC restaurant</span>
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


