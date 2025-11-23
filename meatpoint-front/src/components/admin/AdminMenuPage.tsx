import React from "react";
import type { AdminCategory, AdminProduct } from "../../types";

interface Props {
  categories: AdminCategory[];
  categoriesOptions: { id: number; name: string }[];
  newProduct: {
    categoryId: string;
    name: string;
    description: string;
    sortOrder: string;
    file?: File;
    sizes: { name: string; amount: string; unit: string; price: string }[];
  };
  onNewProductChange: (field: string, value: any) => void;
  onCreateProduct: () => Promise<void>;
  onToggleProduct: (product: AdminProduct) => Promise<void>;
  onSortChange: (product: AdminProduct, sort: number) => Promise<void>;
  onDelete: (productId: number) => Promise<void>;
  onEdit: (product: AdminProduct) => void;
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
  onDelete,
  onEdit,
  saving,
  onRefresh,
}) => {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Меню</p>
          <h2 className="admin-page__title">Товары, варианты и цены</h2>
          <p className="muted">
            Добавляйте варианты размеров с четырьмя полями: название, числовой размер, единицы измерения и цена.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h3>Новый товар</h3>
            <p className="muted">Заполните карточку и варианты размера</p>
          </div>
          <button className="btn btn--primary" onClick={onCreateProduct} disabled={saving}>
            Добавить товар
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
            placeholder="Порядок"
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
          <div className="panel__subhead">Варианты и размеры</div>
          {newProduct.sizes.map((s, idx) => (
            <div key={idx} className="grid grid-4 gap-8 align-center">
              <input
                className="input"
                placeholder="Название (S, M, L)"
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
                placeholder="Размер (число)"
                value={s.amount}
                onChange={(e) => {
                  const next = [...newProduct.sizes];
                  next[idx] = { ...s, amount: e.target.value };
                  onNewProductChange("sizes", next);
                }}
              />
              <input
                className="input"
                placeholder="Ед. измерения (грамм, мл, см)"
                value={s.unit}
                onChange={(e) => {
                  const next = [...newProduct.sizes];
                  next[idx] = { ...s, unit: e.target.value };
                  onNewProductChange("sizes", next);
                }}
              />
              <div className="field-inline field-inline--grow">
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
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        onNewProductChange(
                          "sizes",
                          newProduct.sizes.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      Удалить
                    </button>
                  )}
                  {idx === newProduct.sizes.length - 1 && (
                    <button
                      className="btn btn--outline btn--sm"
                      onClick={() =>
                        onNewProductChange("sizes", [
                          ...newProduct.sizes,
                          { name: "", amount: "", unit: "", price: "" },
                        ])
                      }
                    >
                      + Размер
                    </button>
                  )}
                </div>
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
                  <div className="admin-card__top" onClick={() => onEdit(product)}>
                    <div className="admin-card__img">
                      <img src={product.image_url} alt={product.name} />
                    </div>
                    <div className="admin-card__body">
                      <div className="admin-card__title">
                        {product.name}
                        {product.is_hidden && <span className="chip">Скрыт</span>}
                      </div>
                      {product.description && (
                        <div className="admin-card__meta">{product.description}</div>
                      )}
                      <div className="admin-card__sizes admin-card__sizes--chips">
                        {product.sizes.map((s) => {
                          const amountLabel =
                            s.amount !== null && s.amount !== undefined && s.amount !== 0
                              ? `${s.amount}${s.unit ? ` ${s.unit}` : ""}`
                              : "без объема";
                          return (
                            <span key={s.id} className="chip chip--ghost">
                              {(s.name || "Размер")} · {amountLabel} · {s.price} ₽
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="admin-card__controls">
                    <label className="field-inline">
                      <span>Порядок</span>
                      <input
                        className="input input--sm"
                        type="number"
                        value={product.sort_order}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSortChange(product, Number(e.target.value))}
                      />
                    </label>
                    <div className="panel__actions">
                      <button
                        className="btn btn--outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleProduct(product);
                        }}
                      >
                        {product.is_hidden ? "Показать" : "Скрыть"}
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Удалить товар “${product.name}”?`)) {
                            onDelete(product.id);
                          }
                        }}
                      >
                        Удалить
                      </button>
                      <button
                        className="btn btn--primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(product);
                        }}
                      >
                        Редактировать
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {cat.products.length === 0 && (
                <div className="muted">Товары пока не добавлены.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminMenuPage;
