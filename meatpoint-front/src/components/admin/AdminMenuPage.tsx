import React, { useState } from "react";
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
    calories: string;
    protein: string;
    fat: string;
    carbs: string;
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
  const [deleteTarget, setDeleteTarget] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDeleteModal = (product: AdminProduct) => {
    setDeleteTarget(product);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Меню</p>
          <h2 className="admin-page__title">Товары, варианты и цены</h2>
          <p className="muted">
            Добавляйте варианты размеров; КБЖУ задаётся один раз на 100 г продукта и применяется ко всем размерам.
          </p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      <div className="panel menu-form">
        <div className="panel__header">
          <div>
            <h3>Новый товар</h3>
            <p className="muted">Заполните карточку и варианты размера</p>
          </div>
          <button className="btn btn--primary" onClick={onCreateProduct} disabled={saving}>
            Добавить товар
          </button>
        </div>
        <div className="menu-form__grid">
          <div className="menu-form__section">
            <div className="menu-form__section-title">Основное</div>
            <div className="menu-form__fields">
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
          </div>
          <div className="menu-form__section">
            <div className="menu-form__section-title">КБЖУ (на 100 г)</div>
            <div className="menu-form__nutrition">
              <input
                className="input input--sm"
                type="number"
                placeholder="Ккал"
                value={newProduct.calories}
                onChange={(e) => onNewProductChange("calories", e.target.value)}
              />
              <input
                className="input input--sm"
                type="number"
                placeholder="Белки"
                value={newProduct.protein}
                onChange={(e) => onNewProductChange("protein", e.target.value)}
              />
              <input
                className="input input--sm"
                type="number"
                placeholder="Жиры"
                value={newProduct.fat}
                onChange={(e) => onNewProductChange("fat", e.target.value)}
              />
              <input
                className="input input--sm"
                type="number"
                placeholder="Углеводы"
                value={newProduct.carbs}
                onChange={(e) => onNewProductChange("carbs", e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="menu-form__sizes">
          <div className="menu-form__section-title">Размеры и цены</div>
          {newProduct.sizes.map((s, idx) => (
            <div key={idx} className="menu-size-row">
              <div className="menu-size-row__fields">
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
                  placeholder="Размер (200, 350, 500)"
                  value={s.amount}
                  onChange={(e) => {
                    const next = [...newProduct.sizes];
                    next[idx] = { ...s, amount: e.target.value };
                    onNewProductChange("sizes", next);
                  }}
                />
                <input
                  className="input"
                  placeholder="Ед. измерения (грамм, мл, шт.)"
                  value={s.unit}
                  onChange={(e) => {
                    const next = [...newProduct.sizes];
                    next[idx] = { ...s, unit: e.target.value };
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
              </div>
              <div className="menu-size-row__actions">
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
          ))}
        </div>
      </div>

      <div className="menu-categories">
        {categories.map((cat) => (
          <div key={cat.id} className="menu-category">
            <div className="menu-category__header">
              <div>
                <h3>{cat.name}</h3>
                {cat.description && <p className="muted">{cat.description}</p>}
              </div>
              <div className="menu-category__meta">
                <span className="chip chip--soft">{cat.products.length} позиций</span>
              </div>
            </div>
            <div className="menu-product-grid">
              {cat.products.map((product) => (
                <div key={product.id} className="menu-product-card">
                  <div className="menu-product-card__main" onClick={() => onEdit(product)}>
                    <div className="menu-product-card__media">
                      <img src={product.image_url} alt={product.name} />
                    </div>
                    <div className="menu-product-card__info">
                      <div className="menu-product-card__title">
                        <span>{product.name}</span>
                        {product.is_hidden && <span className="chip chip--ghost">Скрыт</span>}
                      </div>
                      {product.description && (
                        <div className="menu-product-card__desc">{product.description}</div>
                      )}
                      <div className="menu-product-card__sizes">
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
                  <div className="menu-product-card__footer">
                    <label className="field-inline" onClick={(e) => e.stopPropagation()}>
                      <span>Порядок</span>
                      <input
                        className="input input--sm"
                        type="number"
                        value={product.sort_order}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSortChange(product, Number(e.target.value))}
                      />
                    </label>
                    <div className="menu-product-card__actions">
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleProduct(product);
                        }}
                      >
                        {product.is_hidden ? "Показать" : "Скрыть"}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(product);
                        }}
                      >
                        Удалить
                      </button>
                      <button
                        className="btn btn--primary btn--sm"
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

      {deleteTarget && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={closeDeleteModal} disabled={deleting}>
              X
            </button>
            <div className="admin-modal__content">
              <h3 className="admin-modal__title">Точно удалить товар?</h3>
              <p className="admin-modal__text">
                Товар "{deleteTarget.name}" будет скрыт из меню и удалён из списка.
              </p>
              <div className="admin-modal__actions">
                <button className="btn btn--primary" onClick={confirmDelete} disabled={deleting}>
                  Удалить
                </button>
                <button className="btn btn--outline" onClick={closeDeleteModal} disabled={deleting}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMenuPage;
