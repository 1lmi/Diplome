import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Category, MenuItem } from "./types";
import { Header } from "./components/Header";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import { CartDrawer } from "./components/CartDrawer";

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  // refs для секций категорий, чтобы скроллить к ним
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});

  // грузим категории один раз
  useEffect(() => {
    api.getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length) {
        setActiveCategoryId(cats[0].id);
      }
    });
  }, []);

  // грузим ВСЁ меню (без фильтра)
  useEffect(() => {
    setLoadingMenu(true);
    api
      .getMenu() // без category_id
      .then(setMenu)
      .finally(() => setLoadingMenu(false));
  }, []);

  // группируем блюда по категории
  const menuByCategory = useMemo(() => {
    const result: Record<number, MenuItem[]> = {};
    for (const item of menu) {
      if (!result[item.category_id]) {
        result[item.category_id] = [];
      }
      result[item.category_id].push(item);
    }
    // сортировка внутри категории по имени
    Object.values(result).forEach((arr) =>
      arr.sort((a, b) => a.name.localeCompare(b.name))
    );
    return result;
  }, [menu]);

  // обработка клика по вкладке категории: подсветка + плавный скролл
  const handleCategoryClick = (id: number) => {
    setActiveCategoryId(id);
    const el = sectionRefs.current[id];
    if (el) {
      const headerOffset = 80; // примерная высота хедера
      const rect = el.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top - headerOffset;
      window.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="app">
      <Header onCartClick={() => setCartOpen(true)} />

      <main className="main">
        <section className="menu-section">
          <h1 className="page-title">Меню</h1>

          <CategoryTabs
            categories={categories}
            activeId={activeCategoryId ?? undefined}
            onChange={handleCategoryClick}
          />

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
                  <h2 className="menu-category-title" id={`cat-${cat.id}`}>
                    {cat.name}
                  </h2>
                  <div className="product-grid">
                    {items.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onClick={() => setSelectedProduct(product)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
        </section>
      </main>

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default App;
