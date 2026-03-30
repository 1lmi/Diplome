import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "../api";
import type {
  AdminCategory,
  AdminOrder,
  AdminProduct,
  Category,
  SettingsMap,
  StatusOption,
} from "../types";
import "../admin.css";
import AdminDashboard from "./admin/AdminDashboard";
import AdminCategoriesPage from "./admin/AdminCategoriesPage";
import AdminMenuPage from "./admin/AdminMenuPage";
import AdminOrdersPage from "./admin/AdminOrdersPage";
import AdminProductModal from "./admin/AdminProductModal";
import AdminStatisticsPage from "./admin/AdminStatisticsPage";
import { useToast } from "../ui/ToastProvider";

interface Props {
  statuses: StatusOption[];
}

interface NewProductForm {
  categoryId: string;
  name: string;
  description: string;
  sortOrder: string;
  file?: File;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  sizes: { name: string; amount: string; unit: string; price: string }[];
}

interface ProductUpdateDraft {
  name: string;
  description?: string | null;
  sort_order: number;
  is_hidden: boolean;
  is_active: boolean;
  sizes: {
    id?: number;
    size_name: string;
    amount?: number | null;
    unit?: string | null;
    price: number;
    is_hidden?: boolean;
    calories?: number | null;
    protein?: number | null;
    fat?: number | null;
    carbs?: number | null;
  }[];
  remove_size_ids: number[];
  image_file?: File;
}

export const AdminPanel: React.FC<Props> = ({ statuses }) => {
  const { pushToast } = useToast();
  const [menu, setMenu] = useState<AdminCategory[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [newProduct, setNewProduct] = useState<NewProductForm>({
    categoryId: "",
    name: "",
    description: "",
    sortOrder: "",
    calories: "",
    protein: "",
    fat: "",
    carbs: "",
    sizes: [{ name: "", amount: "", unit: "", price: "" }],
  });
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);

  useEffect(() => {
    refreshAll();
  }, []);

  const patchProductInMenu = (product: AdminProduct) => {
    setMenu((prev) =>
      prev.map((cat) =>
        cat.id === product.category_id
          ? {
              ...cat,
              products: cat.products.map((p) => (p.id === product.id ? product : p)),
            }
          : cat
      )
    );
  };

  const addProductToMenu = (product: AdminProduct) => {
    setMenu((prev) =>
      prev.map((cat) =>
        cat.id === product.category_id
          ? { ...cat, products: [...cat.products, product] }
          : cat
      )
    );
  };

  const removeProductFromMenu = (productId: number, categoryId: number) => {
    setMenu((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, products: cat.products.filter((p) => p.id !== productId) }
          : cat
      )
    );
  };

  const patchCategoryInMenu = (category: Partial<Category> & { id: number }) => {
    setMenu((prev) => prev.map((cat) => (cat.id === category.id ? { ...cat, ...category } : cat)));
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [menuData, ordersData, settingsData] = await Promise.all([
        api.adminMenu(),
        api.adminOrders(),
        api.getSettings(),
      ]);
      setMenu(menuData);
      setOrders(ordersData);
      setSettings(settingsData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadAndGetPath = async (file?: File) => {
    if (!file) return undefined;
    const uploaded = await api.uploadImage(file);
    return uploaded.filename;
  };

  const handleToggleProduct = async (product: AdminProduct) => {
    try {
      const updated = await api.updateProduct(product.id, { is_hidden: !product.is_hidden });
      patchProductInMenu(updated);
      pushToast({
        tone: "success",
        title: updated.is_hidden ? "Товар скрыт" : "Товар снова виден",
        description: updated.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось изменить видимость товара",
        description: e.message,
      });
      throw e;
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) return;
    setSaving(true);
    try {
      const created = await api.createCategory({
        name: newCategory.name.trim(),
        description: newCategory.description || undefined,
        sort_order: menu.length,
      });
      setNewCategory({ name: "", description: "" });
      setMenu((prev) => [
        ...prev,
        {
          ...created,
          description: created.description ?? null,
          is_hidden: created.is_hidden ?? false,
          products: [],
        } as AdminCategory,
      ]);
      pushToast({
        tone: "success",
        title: "Категория добавлена",
        description: created.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось добавить категорию",
        description: e.message,
      });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.categoryId) {
      return;
    }
    setSaving(true);
    try {
      const imagePath = await uploadAndGetPath(newProduct.file);
      const sizePayload = newProduct.sizes
        .filter((s) => s.name.trim() && s.price.trim())
        .map((s) => ({
          size_name: s.name.trim(),
          amount: s.amount ? Number(s.amount) : undefined,
          unit: s.unit.trim() || undefined,
          price: Number(s.price),
          calories: newProduct.calories ? Number(newProduct.calories) : undefined,
          protein: newProduct.protein ? Number(newProduct.protein) : undefined,
          fat: newProduct.fat ? Number(newProduct.fat) : undefined,
          carbs: newProduct.carbs ? Number(newProduct.carbs) : undefined,
          is_hidden: false,
        }));
      const created = await api.createProduct({
        category_id: Number(newProduct.categoryId),
        name: newProduct.name.trim(),
        description: newProduct.description || undefined,
        image_path: imagePath,
        sizes: sizePayload,
        sort_order:
          menu.find((category) => category.id === Number(newProduct.categoryId))?.products.length || 0,
      });
      setNewProduct({
        categoryId: "",
        name: "",
        description: "",
        sortOrder: "",
        file: undefined,
        calories: "",
        protein: "",
        fat: "",
        carbs: "",
        sizes: [{ name: "", amount: "", unit: "", price: "" }],
      });
      addProductToMenu(created);
      pushToast({
        tone: "success",
        title: "Товар добавлен",
        description: created.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось добавить товар",
        description: e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      pushToast({
        tone: "success",
        title: "Настройки сохранены",
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить настройки",
        description: e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOrderTransition = async (orderId: number, targetStatus: string) => {
    setError(null);
    try {
      const updated = await api.updateOrderStatus(orderId, targetStatus);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  };

  const handleUpdateCategory = async (id: number, payload: Partial<Category>) => {
    try {
      const updated = await api.updateCategory(id, payload);
      patchCategoryInMenu(updated);
      pushToast({
        tone: "success",
        title: "Категория обновлена",
        description: updated.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить категорию",
        description: e.message,
      });
      throw e;
    }
  };

  const handleDeleteCategory = async (categoryId: number, deleteProducts: boolean) => {
    setSaving(true);
    try {
      const deleted = menu.find((c) => c.id === categoryId);
      await api.deleteCategory(categoryId, deleteProducts);
      setMenu((prev) => prev.filter((c) => c.id !== categoryId));
      pushToast({
        tone: "success",
        title: "Категория удалена",
        description: deleted?.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось удалить категорию",
        description: e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    const cat = menu.find((c) => c.products.some((p) => p.id === productId));
    const product = cat?.products.find((p) => p.id === productId);
    try {
      await api.deleteProduct(productId);
      if (cat) removeProductFromMenu(productId, cat.id);
      pushToast({
        tone: "success",
        title: "Товар удален",
        description: product?.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось удалить товар",
        description: e.message,
      });
      throw e;
    }
  };

  const handleSaveProduct = async (productId: number, payload: ProductUpdateDraft) => {
    setSaving(true);
    try {
      const { image_file, ...rest } = payload;
      let imagePath: string | undefined;
      if (image_file) {
        imagePath = await uploadAndGetPath(image_file);
      }
      const updated = await api.updateProduct(productId, {
        ...rest,
        image_path: imagePath,
      });
      patchProductInMenu(updated);
      setEditingProduct(null);
      pushToast({
        tone: "success",
        title: "Изменения сохранены",
        description: updated.name,
      });
    } catch (e: any) {
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить товар",
        description: e.message,
      });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleReorderCategories = async (categoryIds: number[]) => {
    const previous = menu;
    const byId = new Map(previous.map((category) => [category.id, category]));
    const reordered = categoryIds
      .map((id, index) => {
        const category = byId.get(id);
        return category ? { ...category, sort_order: index } : null;
      })
      .filter(Boolean) as AdminCategory[];

    setMenu(reordered);
    try {
      await Promise.all(
        reordered.map((category, index) =>
          api.updateCategory(category.id, { sort_order: index })
        )
      );
      pushToast({
        tone: "success",
        title: "Порядок категорий обновлен",
      });
    } catch (e: any) {
      setMenu(previous);
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить порядок категорий",
        description: e.message,
      });
      throw e;
    }
  };

  const handleReorderProducts = async (categoryId: number, productIds: number[]) => {
    const previous = menu;
    const category = previous.find((item) => item.id === categoryId);
    if (!category) return;

    const byId = new Map(category.products.map((product) => [product.id, product]));
    const reorderedProducts = productIds
      .map((id, index) => {
        const product = byId.get(id);
        return product ? { ...product, sort_order: index } : null;
      })
      .filter(Boolean) as AdminProduct[];

    setMenu((prev) =>
      prev.map((item) =>
        item.id === categoryId ? { ...item, products: reorderedProducts } : item
      )
    );

    try {
      await Promise.all(
        reorderedProducts.map((product, index) =>
          api.updateProduct(product.id, { sort_order: index })
        )
      );
      pushToast({
        tone: "success",
        title: "Порядок товаров обновлен",
        description: category.name,
      });
    } catch (e: any) {
      setMenu(previous);
      setError(e.message);
      pushToast({
        tone: "error",
        title: "Не удалось сохранить порядок товаров",
        description: e.message,
      });
      throw e;
    }
  };

  const categoriesOptions = useMemo(() => menu.map((m) => ({ id: m.id, name: m.name })), [menu]);

  if (loading) {
    return <div className="panel">Загружаем админку...</div>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="logo-sm">SC</div>
          <div>
            <div className="admin-brand__title">Панель</div>
            <div className="admin-brand__subtitle">Управление</div>
          </div>
        </div>
        <nav className="admin-nav">
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Дашборд
          </NavLink>
          <NavLink
            to="/admin/stats"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Статистика
          </NavLink>
          <NavLink
            to="/admin/categories"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Управление категориями
          </NavLink>
          <NavLink
            to="/admin/menu"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Управление меню
          </NavLink>
          <NavLink
            to="/admin/orders/current"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Текущие заказы
          </NavLink>
          <NavLink
            to="/admin/orders/history"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            История заказов
          </NavLink>
        </nav>
        <button className="btn btn--ghost" onClick={refreshAll}>
          Обновить данные
        </button>
      </aside>

      <div className="admin-content">
        {error && <div className="alert alert--error">{error}</div>}
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <AdminDashboard
                orders={orders}
                settings={settings}
                onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
                onSaveSettings={handleSettingsSave}
                onRefresh={refreshAll}
                saving={saving}
              />
            }
          />
          <Route
            path="stats"
            element={
              <AdminStatisticsPage orders={orders} statuses={statuses} onRefresh={refreshAll} />
            }
          />
          <Route
            path="categories"
            element={
              <AdminCategoriesPage
                categories={menu}
                newCategory={newCategory}
                onNewCategoryChange={(field, value) => setNewCategory((c) => ({ ...c, [field]: value }))}
                onCreateCategory={handleCreateCategory}
                onUpdateCategory={handleUpdateCategory}
                onDeleteCategory={handleDeleteCategory}
                onReorderCategories={handleReorderCategories}
                saving={saving}
                onRefresh={refreshAll}
              />
            }
          />
          <Route
            path="menu"
            element={
              <AdminMenuPage
                categories={menu}
                categoriesOptions={categoriesOptions}
                newProduct={newProduct}
                onNewProductChange={(field, value) => setNewProduct((p) => ({ ...p, [field]: value }))}
                onCreateProduct={handleCreateProduct}
                onToggleProduct={handleToggleProduct}
                onReorderProducts={handleReorderProducts}
                onDelete={handleDeleteProduct}
                onEdit={(product) => setEditingProduct(product)}
                saving={saving}
                onRefresh={refreshAll}
              />
            }
          />
          <Route path="orders" element={<Navigate to="current" replace />} />
          <Route
            path="orders/current"
            element={
              <AdminOrdersPage
                key="current-orders"
                orders={orders}
                statuses={statuses}
                mode="current"
                onTransition={handleOrderTransition}
                onRefresh={refreshAll}
              />
            }
          />
          <Route
            path="orders/history"
            element={
              <AdminOrdersPage
                key="history-orders"
                orders={orders}
                statuses={statuses}
                mode="history"
                onTransition={handleOrderTransition}
                onRefresh={refreshAll}
              />
            }
          />
        </Routes>
        {editingProduct && (
          <AdminProductModal
            product={editingProduct}
            onClose={() => setEditingProduct(null)}
            onSave={handleSaveProduct}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
};
