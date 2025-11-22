import React, { useEffect, useState } from "react";
import type { AdminCategory, AdminProduct, ProductSize } from "../../types";

interface NewSizeForm {
  name: string;
  price: string;
}

interface Props {
  categories: AdminCategory[];
  categoriesOptions: { id: number; name: string }[];
  newProduct: {
    categoryId: string;
    name: string;
    description: string;
    sortOrder: string;
    file?: File;
    sizes: { name: string; price: string }[];
  };
  onNewProductChange: (field: string, value: any) => void;
  onCreateProduct: () => Promise<void>;
  onToggleProduct: (product: AdminProduct) => Promise<void>;
  onSortChange: (product: AdminProduct, sort: number) => Promise<void>;
  onSaveSize: (product: AdminProduct, sizeId: number, patch: { name: string; price: number }) => Promise<void>;
  onAddSize: (product: AdminProduct, size: { name: string; price: number }) => Promise<void>;
  onUpload: (productId: number, file?: File) => Promise<void>;
  onDelete: (productId: number) => Promise<void>;
  saving: boolean;
  onRefresh: () => void;
}

const AdminMenuPage: React.FC<Props> = ({
  categories,
  categoriesOptions,
  newProduct,
  onNewProductChange,
  onCreateProduct,
  onToggleProduct,
  onSortChange,
  onSaveSize,
  onAddSize,
  onUpload,
  onDelete,
  saving,
  onRefresh,
}) => {
  const [sizeDrafts, setSizeDrafts] = useState<Record<number, ProductSize[]>>({});
  const [newSizeForms, setNewSizeForms] = useState<Record<number, NewSizeForm>>({});

  useEffect(() => {
    const map: Record<number, ProductSize[]> = {};
    const addForms: Record<number, NewSizeForm> = {};
    categories.forEach((cat) => {
      cat.products.forEach((p) => {
        map[p.id] = p.sizes.map((s) => ({ ...s }));
        addForms[p.id] = addForms[p.id] || { name: "", price: "" };
      });
    });
    setSizeDrafts(map);
    setNewSizeForms(addForms);
  }, [categories]);

  const updateSizeDraft = (productId: number, sizeId: number, field: keyof ProductSize, value: any) => {
    setSizeDrafts((prev) => ({
      ...prev,
      [productId]: (prev[productId] || []).map((s) =>
        s.id === sizeId ? { ...s, [field]: value } : s
      ),
    }));
  };

  const handleSaveSizeClick = async (product: AdminProduct, sizeId: number) => {
    const size = (sizeDrafts[product.id] || []).find((s) => s.id === sizeId);
    if (!size) return;
    await onSaveSize(product, sizeId, {
      name: size.name || "",
      price: Number(size.price),
    });
  };

  const handleAddSizeClick = async (product: AdminProduct) => {
    const form = newSizeForms[product.id] || { name: "", price: "" };
    if (!form.name.trim() || !form.price.trim()) return;
    await onAddSize(product, { name: form.name.trim(), price: Number(form.price) });
    setNewSizeForms((prev) => ({
      ...prev,
      [product.id]: { name: "", price: "" },
    }));
  };

  const updateNewSizeForm = (productId: number, field: keyof NewSizeForm, value: string) => {
    setNewSizeForms((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || { name: "", price: "" }), [field]: value },
    }));
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Управление меню</p>
          <h2 className="admin-page__title">Блюда, размеры и цены</h2>
          <p className="muted">
            Задайте несколько размеров (например, S/M/L), их цены и меняйте состав прямо здесь.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Перезагрузить
        </button>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h3>Новое блюдо</h3>
            <p className="muted">Добавьте позицию и сразу задайте размеры</p>
          </div>
          <button
            className="btn btn--primary"
            onClick={onCreateProduct}
            disabled={saving}
          >
            Добавить блюдо
          </button>
        </div>
        <div className="grid grid-3 gap-8">
          <select
            className="input"
            value={newProduct.categoryId}
            onChange={(e) => onNewProductChange("categoryId", e.target.value)}
          >
            <option value="">Категория</option>
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
            onChange={(e) => onNewProductChange("name", e.target.value)}
          />
          <input
            className="input"
            placeholder="Описание"
            value={newProduct.description}
            onChange={(e) => onNewProductChange("description", e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Сортировка"
            value={newProduct.sortOrder}
            onChange={(e) => onNewProductChange("sortOrder", e.target.value)}
          />
          <input
            className="input input--file"
            type="file"
            accept="image/*"
            onChange={(e) => onNewProductChange("file", e.target.files?.[0])}
          />
        </div>
        <div className="stack gap-8">
          <div className="panel__subhead">Размеры и цены</div>
          {newProduct.sizes.map((s, idx) => (
            <div key={idx} className="grid grid-3 gap-8">
              <input
                className="input"
                placeholder="Размер (например, S, M, L)"
                value={s.name}
                onChange={(e) => {
                  const next = [...newProduct.sizes];
                  next[idx] = { ...s, name: e.target.value };
                  onNewProductChange("sizes", next);
                }}
              />
              <input
                className="input"
                type="number"
                placeholder="Цена"
                value={s.price}
                onChange={(e) => {
                  const next = [...newProduct.sizes];
                  next[idx] = { ...s, price: e.target.value };
                  onNewProductChange("sizes", next);
                }}
              />
              <div className="panel__actions">
                {newProduct.sizes.length > 1 && (
                  <button
                    className="btn btn--ghost"
                    onClick={() => onNewProductChange("sizes", newProduct.sizes.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </button>
                )}
                {idx === newProduct.sizes.length - 1 && (
                  <button
                    className="btn btn--outline"
                    onClick={() => onNewProductChange("sizes", [...newProduct.sizes, { name: "", price: "" }])}
                  >
                    + Размер
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stack gap-10">
        {categories.map((cat) => (
          <div key={cat.id} className="panel">
            <div className="panel__header">
              <div>
                <h3>{cat.name}</h3>
                {cat.description && <p className="muted">{cat.description}</p>}
              </div>
            </div>
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
                        {(sizeDrafts[product.id] || product.sizes).map((s) => (
                          <div key={s.id} className="field-inline field-inline--grow">
                            <input
                              className="input input--sm"
                              placeholder="Размер"
                              value={s.name || ""}
                              onChange={(e) =>
                                updateSizeDraft(product.id, s.id, "name", e.target.value)
                              }
                            />
                            <input
                              className="input input--sm"
                              type="number"
                              placeholder="Цена"
                              value={s.price}
                              onChange={(e) =>
                                updateSizeDraft(product.id, s.id, "price", Number(e.target.value))
                              }
                            />
                            <button
                              className="btn btn--outline btn--sm"
                              onClick={() => handleSaveSizeClick(product, s.id)}
                            >
                              Сохранить
                            </button>
                          </div>
                        ))}
                        <div className="field-inline field-inline--grow">
                          <input
                            className="input input--sm"
                            placeholder="Новый размер"
                            value={newSizeForms[product.id]?.name || ""}
                            onChange={(e) =>
                              updateNewSizeForm(product.id, "name", e.target.value)
                            }
                          />
                          <input
                            className="input input--sm"
                            type="number"
                            placeholder="Цена"
                            value={newSizeForms[product.id]?.price || ""}
                            onChange={(e) =>
                              updateNewSizeForm(product.id, "price", e.target.value)
                            }
                          />
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleAddSizeClick(product)}
                          >
                            + Добавить размер
                          </button>
                        </div>
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
                        onChange={(e) => onSortChange(product, Number(e.target.value))}
                      />
                    </label>
                    <input
                      className="input input--file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => onUpload(product.id, e.target.files?.[0])}
                    />
                    <button
                      className="btn btn--outline"
                      onClick={() => onToggleProduct(product)}
                    >
                      {product.is_hidden ? "Показать" : "Скрыть"}
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={() => onDelete(product.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
              {cat.products.length === 0 && (
                <div className="muted">Пока нет блюд в этой категории.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminMenuPage;
