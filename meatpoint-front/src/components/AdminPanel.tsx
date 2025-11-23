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

interface Props {
  statuses: StatusOption[];
}

interface NewProductForm {
  categoryId: string;
  name: string;
  description: string;
  sortOrder: string;
  file?: File;
  sizes: { name: string; price: string }[];
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
    sizes: [{ name: "", price: "" }],
  });
  const [orderStatuses, setOrderStatuses] = useState<Record<number, string>>({});

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

  const handleUpload = async (productId: number, file?: File) => {
    if (!file) return;
    const uploaded = await api.uploadImage(file);
    const updated = await api.updateProduct(productId, { image_path: uploaded.filename });
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
        .map((s) => ({ size_name: s.name.trim(), price: Number(s.price), is_hidden: false }));
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
        sizes: [{ name: "", price: "" }],
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

  const handleDeleteProduct = async (productId: number) => {
    const cat = menu.find((c) => c.products.some((p) => p.id === productId));
    await api.deleteProduct(productId);
    if (cat) removeProductFromMenu(productId, cat.id);
  };

  const handleSaveSize = async (
    product: AdminProduct,
    sizeId: number,
    patch: { name: string; price: number }
  ) => {
    const updated = await api.updateProduct(product.id, {
      sizes: [{ id: sizeId, size_name: patch.name || "Стандарт", price: patch.price }],
    });
    patchProductInMenu(updated);
  };

  const handleAddSize = async (product: AdminProduct, size: { name: string; price: number }) => {
    const updated = await api.updateProduct(product.id, {
      sizes: [{ size_name: size.name, price: size.price, is_hidden: false }],
    });
    patchProductInMenu(updated);
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
            to="/admin/orders"
            className={({ isActive }) =>
              "admin-nav__item" + (isActive ? " admin-nav__item--active" : "")
            }
          >
            Заказы
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
                statuses={statuses}
                settings={settings}
                onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
                onSaveSettings={handleSettingsSave}
                onRefresh={refreshAll}
                saving={saving}
              />
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
                onSaveSize={handleSaveSize}
                onAddSize={handleAddSize}
                onUpload={handleUpload}
                onDelete={handleDeleteProduct}
                saving={saving}
                onRefresh={refreshAll}
              />
            }
          />
          <Route
            path="orders"
            element={
              <AdminOrdersPage
                orders={orders}
                statuses={statuses}
                orderStatuses={orderStatuses}
                onStatusChange={(id, status) => setOrderStatuses((s) => ({ ...s, [id]: status }))}
                onApplyStatus={handleOrderStatusChange}
                onRefresh={refreshAll}
              />
            }
          />
        </Routes>
      </div>
    </div>
  );
};
