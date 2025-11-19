import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { Category, MenuItem } from "./types";
import { Header } from "./components/Header";
import { CategoryTabs } from "./components/CategoryTabs";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import { CartDrawer } from "./components/CartDrawer";

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>(
    undefined
  );
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    api.getCategories().then((cats) => {
      setCategories(cats);
      if (!activeCategoryId && cats.length) {
        setActiveCategoryId(cats[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeCategoryId) return;
    setLoadingMenu(true);
    api
      .getMenu(activeCategoryId)
      .then(setMenu)
      .finally(() => setLoadingMenu(false));
  }, [activeCategoryId]);

  return (
    <div className="app">
      <Header onCartClick={() => setCartOpen(true)} />

      <main className="main">
        <section className="menu-section">
          <h1 className="page-title">Меню</h1>

          <CategoryTabs
            categories={categories}
            activeId={activeCategoryId}
            onChange={(id) => setActiveCategoryId(id)}
          />

          {loadingMenu && <p className="loading">Загружаем меню...</p>}

          {!loadingMenu && (
            <div className="product-grid">
              {menu.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedProduct(product)}
                />
              ))}
            </div>
          )}
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
