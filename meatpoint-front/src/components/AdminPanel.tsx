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
  }[];
  remove_size_ids: number[];
  image_file?: File;
}

export const AdminPanel: React.FC<Props> = ({ statuses }) => {
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
  const [orderStatuses, setOrderStatuses] = useState<Record<number, string>>({});
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
          ? { ...cat, products: [product, ...cat.products] }
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
    const updated = await api.updateProduct(product.id, { is_hidden: !product.is_hidden });
    patchProductInMenu(updated);
  };

  const handleSortChange = async (product: AdminProduct, sort: number) => {
    const updated = await api.updateProduct(product.id, { sort_order: sort });
    patchProductInMenu(updated);
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) return;
    const created = await api.createCategory({
      name: newCategory.name.trim(),
      description: newCategory.description || undefined,
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
        sort_order: Number(newProduct.sortOrder) || 0,
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOrderStatusChange = async (orderId: number) => {
    const status = orderStatuses[orderId];
    if (!status) return;
    const updated = await api.updateOrderStatus(orderId, status);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: updated.status, status_name: updated.status_name } : o))
    );
  };

  const handleUpdateCategory = async (id: number, payload: Partial<Category>) => {
    const updated = await api.updateCategory(id, payload);
    patchCategoryInMenu(updated);
  };

  const handleDeleteCategory = async (categoryId: number, deleteProducts: boolean) => {
    setSaving(true);
    try {
      await api.deleteCategory(categoryId, deleteProducts);
      setMenu((prev) => prev.filter((c) => c.id !== categoryId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    const cat = menu.find((c) => c.products.some((p) => p.id === productId));
    await api.deleteProduct(productId);
    if (cat) removeProductFromMenu(productId, cat.id);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
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
          <div className="logo-sm">MP</div>
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
                onSortChange={handleSortChange}
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
                orderStatuses={orderStatuses}
                onStatusChange={(id, status) => setOrderStatuses((s) => ({ ...s, [id]: status }))}
                onApplyStatus={handleOrderStatusChange}
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
                orderStatuses={orderStatuses}
                onStatusChange={(id, status) => setOrderStatuses((s) => ({ ...s, [id]: status }))}
                onApplyStatus={handleOrderStatusChange}
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
