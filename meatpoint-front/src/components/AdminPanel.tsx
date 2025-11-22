import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
  AdminCategory,
  AdminOrder,
  AdminProduct,
  SettingsMap,
  StatusOption,
} from "../types";

interface Props {
  statuses: StatusOption[];
}

interface NewProductForm {
  categoryId: string;
  name: string;
  description: string;
  sizeLabel: string;
  price: string;
  sortOrder: string;
  file?: File;
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
    sizeLabel: "",
    price: "",
    sortOrder: "",
  });
  const [orderStatuses, setOrderStatuses] = useState<Record<number, string>>({});

  useEffect(() => {
    refreshAll();
  }, []);

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
    await api.updateProduct(product.id, { is_hidden: !product.is_hidden });
    await refreshAll();
  };

  const handleSortChange = async (product: AdminProduct, sort: number) => {
    await api.updateProduct(product.id, { sort_order: sort });
    await refreshAll();
  };

  const handleSizePriceChange = async (
    product: AdminProduct,
    sizeId: number,
    price: number
  ) => {
    await api.updateProduct(product.id, {
      sizes: [{ id: sizeId, price }],
    });
    await refreshAll();
  };

  const handleUpload = async (productId: number, file?: File) => {
    if (!file) return;
    const uploaded = await api.uploadImage(file);
    await api.updateProduct(productId, { image_path: uploaded.filename });
    await refreshAll();
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) return;
    await api.createCategory({
      name: newCategory.name.trim(),
      description: newCategory.description || undefined,
    });
    setNewCategory({ name: "", description: "" });
    await refreshAll();
  };

  const handleCreateProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.categoryId || !newProduct.price) {
      return;
    }
    setSaving(true);
    try {
      const imagePath = await uploadAndGetPath(newProduct.file);
      await api.createProduct({
        category_id: Number(newProduct.categoryId),
        name: newProduct.name.trim(),
        description: newProduct.description || undefined,
        image_path: imagePath,
        price: Number(newProduct.price),
        size_name: newProduct.sizeLabel || "Стандарт",
        sort_order: Number(newProduct.sortOrder) || 0,
      });
      setNewProduct({
        categoryId: "",
        name: "",
        description: "",
        sizeLabel: "",
        price: "",
        sortOrder: "",
      });
      await refreshAll();
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
    await api.updateOrderStatus(orderId, status);
    await refreshAll();
  };

  const categoriesOptions = useMemo(
    () => menu.map((m) => ({ id: m.id, name: m.name })),
    [menu]
  );

  if (loading) {
    return <div className="panel">Загружаем данные...</div>;
  }

  if (error) {
    return <div className="panel alert alert--error">{error}</div>;
  }

  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Витрина</h2>
            <p className="muted">Заголовок, подзаголовок и контакты на главной.</p>
          </div>
          <button className="btn btn--primary" onClick={handleSettingsSave} disabled={saving}>
            Сохранить
          </button>
        </div>
        <div className="stack gap-8">
          <label className="field">
            <span>Заголовок</span>
            <input
              className="input"
              value={settings.hero_title || ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, hero_title: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Подзаголовок</span>
            <input
              className="input"
              value={settings.hero_subtitle || ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, hero_subtitle: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input
              className="input"
              value={settings.contact_phone || ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, contact_phone: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Подсказка доставки</span>
            <input
              className="input"
              value={settings.delivery_hint || ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, delivery_hint: e.target.value }))
              }
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Категории</h2>
            <p className="muted">Название и описание разделов.</p>
          </div>
          <button className="btn btn--outline" onClick={handleCreateCategory}>
            Добавить
          </button>
        </div>
        <div className="stack gap-6">
          <input
            className="input"
            placeholder="Название категории"
            value={newCategory.name}
            onChange={(e) =>
              setNewCategory((c) => ({ ...c, name: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="Описание"
            value={newCategory.description}
            onChange={(e) =>
              setNewCategory((c) => ({ ...c, description: e.target.value }))
            }
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Новое блюдо</h2>
            <p className="muted">Загрузите фото, задайте цену и размер.</p>
          </div>
          <button className="btn btn--primary" onClick={handleCreateProduct} disabled={saving}>
            Создать
          </button>
        </div>
        <div className="grid grid-2 gap-8">
          <select
            className="input"
            value={newProduct.categoryId}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, categoryId: e.target.value }))
            }
          >
            <option value="">Выберите категорию</option>
            {categoriesOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Название"
            value={newProduct.name}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, name: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="Описание"
            value={newProduct.description}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, description: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="Размер (например, 30 см)"
            value={newProduct.sizeLabel}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, sizeLabel: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            placeholder="Цена"
            value={newProduct.price}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, price: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            placeholder="Порядок сортировки"
            value={newProduct.sortOrder}
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, sortOrder: e.target.value }))
            }
          />
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) =>
              setNewProduct((p) => ({ ...p, file: e.target.files?.[0] }))
            }
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Меню</h2>
            <p className="muted">Редактируйте цены, скрывайте позиции.</p>
          </div>
          <button className="btn btn--outline" onClick={refreshAll}>
            Обновить
          </button>
        </div>
        <div className="stack gap-8">
          {menu.map((cat) => (
            <div key={cat.id}>
              <div className="panel__subhead">{cat.name}</div>
              <div className="admin-products">
                {cat.products.map((product) => (
                  <div key={product.id} className="admin-card">
                    <div className="admin-card__top">
                      <div className="admin-card__img">
                        <img src={product.image_url} alt={product.name} />
                      </div>
                      <div className="admin-card__body">
                        <div className="admin-card__title">
                          {product.name}
                          {product.is_hidden && <span className="chip">Скрыто</span>}
                        </div>
                        {product.description && (
                          <div className="admin-card__meta">{product.description}</div>
                        )}
                        <div className="admin-card__sizes">
                          {product.sizes.map((s) => (
                            <label key={s.id} className="field-inline">
                              <span>{s.name || "Размер"}</span>
                              <input
                                className="input input--sm"
                                type="number"
                                value={s.price}
                                onChange={(e) =>
                                  handleSizePriceChange(
                                    product,
                                    s.id,
                                    Number(e.target.value)
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="admin-card__controls">
                      <label className="field-inline">
                        <span>Сортировка</span>
                        <input
                          className="input input--sm"
                          type="number"
                          value={product.sort_order}
                          onChange={(e) =>
                            handleSortChange(product, Number(e.target.value))
                          }
                        />
                      </label>
                      <input
                        className="input input--file"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUpload(product.id, e.target.files?.[0])}
                      />
                      <button
                        className="btn btn--outline"
                        onClick={() => handleToggleProduct(product)}
                      >
                        {product.is_hidden ? "Показать" : "Скрыть"}
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => api.deleteProduct(product.id).then(refreshAll)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Заказы</h2>
            <p className="muted">Обновляйте статусы и держите клиентов в курсе.</p>
          </div>
          <button className="btn btn--outline" onClick={refreshAll}>
            Обновить
          </button>
        </div>
        <div className="stack gap-6">
          {orders.map((order) => (
            <div key={order.id} className="admin-row">
              <div>
                <div className="admin-row__title">
                  №{order.id} · {order.total_price} руб.
                </div>
                <div className="admin-row__meta">
                  {order.customer_name || "Без имени"} · {order.customer_phone}
                </div>
              </div>
              <div className="admin-row__controls">
                <select
                  className="input input--sm"
                  value={orderStatuses[order.id] ?? order.status}
                  onChange={(e) =>
                    setOrderStatuses((s) => ({
                      ...s,
                      [order.id]: e.target.value,
                    }))
                  }
                >
                  {statuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => handleOrderStatusChange(order.id)}
                >
                  Применить
                </button>
              </div>
            </div>
          ))}
          {!orders.length && <div className="muted">Пока нет заказов.</div>}
        </div>
      </section>
    </div>
  );
};
