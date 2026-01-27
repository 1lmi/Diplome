import React, { useEffect, useMemo, useState } from "react";
import type { AdminCategory, Category } from "../../types";

interface Props {
  categories: AdminCategory[];
  newCategory: { name: string; description: string };
  onNewCategoryChange: (field: "name" | "description", value: string) => void;
  onCreateCategory: () => Promise<void> | void;
  onUpdateCategory: (id: number, payload: Partial<Category>) => Promise<void>;
  onDeleteCategory: (id: number, deleteProducts: boolean) => Promise<void>;
  onRefresh: () => void;
}

const AdminCategoriesPage: React.FC<Props> = ({
  categories,
  newCategory,
  onNewCategoryChange,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onRefresh,
}) => {
  const [drafts, setDrafts] = useState<Record<number, Category>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deleteState, setDeleteState] = useState<{
    category: AdminCategory;
    deleteProducts: boolean | null;
    step: "choice" | "confirm";
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const map: Record<number, Category> = {};
    categories.forEach((cat) => {
      map[cat.id] = {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        sort_order: cat.sort_order,
        is_hidden: cat.is_hidden,
      };
    });
    setDrafts(map);
  }, [categories]);

  const handleDraftChange = (
    id: number,
    field: keyof Category,
    value: string | number | boolean | null
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSave = async (id: number) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      await onUpdateCategory(id, {
        name: draft.name?.trim() || undefined,
        description: draft.description || null,
        sort_order: draft.sort_order,
        is_hidden: draft.is_hidden,
      });
    } finally {
      setSavingId(null);
    }
  };

  const openDeleteModal = (cat: AdminCategory) => {
    setDeleteState({ category: cat, deleteProducts: null, step: "choice" });
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteState(null);
  };

  const chooseDeleteMode = (deleteProducts: boolean) => {
    setDeleteState((prev) =>
      prev ? { ...prev, deleteProducts, step: "confirm" } : prev
    );
  };

  const confirmDelete = async () => {
    if (!deleteState || deleteState.deleteProducts === null) return;
    setDeleting(true);
    try {
      await onDeleteCategory(deleteState.category.id, deleteState.deleteProducts);
      setDeleteState(null);
    } finally {
      setDeleting(false);
    }
  };

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Управление категориями</p>
          <h2 className="admin-page__title">Структура меню</h2>
          <p className="muted">Создавайте, сортируйте и скрывайте категории.</p>
        </div>
        <button className="btn btn--outline" onClick={onRefresh}>
          Перезагрузить
        </button>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <h3>Новая категория</h3>
            <p className="muted">Заполните и нажмите добавить</p>
          </div>
          <button className="btn btn--primary" onClick={onCreateCategory}>
            Добавить
          </button>
        </div>
        <div className="grid grid-2 gap-8">
          <input
            className="input"
            placeholder="Название"
            value={newCategory.name}
            onChange={(e) => onNewCategoryChange("name", e.target.value)}
          />
          <input
            className="input"
            placeholder="Описание"
            value={newCategory.description}
            onChange={(e) => onNewCategoryChange("description", e.target.value)}
          />
        </div>
      </div>

      <div className="category-list">
        {sortedCats.map((cat) => {
          const draft = drafts[cat.id] || cat;
          const isActive = !draft.is_hidden;
          return (
            <div key={cat.id} className="category-card">
              <div className="category-card__fields">
                <label className="field">
                  <span>Название</span>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(e) => handleDraftChange(cat.id, "name", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Описание</span>
                  <input
                    className="input"
                    value={draft.description || ""}
                    onChange={(e) => handleDraftChange(cat.id, "description", e.target.value)}
                  />
                </label>
                <label className="field category-card__sort">
                  <span>Сортировка</span>
                  <input
                    className="input"
                    type="number"
                    value={draft.sort_order}
                    onChange={(e) => handleDraftChange(cat.id, "sort_order", Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="category-card__side">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => handleDraftChange(cat.id, "is_hidden", !e.target.checked)}
                  />
                  <span>Активен</span>
                </label>
                <div className="category-card__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleSave(cat.id)}
                    disabled={savingId === cat.id}
                  >
                    {savingId === cat.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => openDeleteModal(cat)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {deleteState && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={closeDeleteModal} disabled={deleting}>
              X
            </button>
            <div className="admin-modal__content">
              {deleteState.step === "choice" ? (
                <>
                  <h3 className="admin-modal__title">
                    Удалить категорию "{deleteState.category.name}"
                  </h3>
                  <p className="admin-modal__text">Удалить все товары в этой категории?</p>
                  <div className="admin-modal__actions">
                    <button
                      className="btn btn--primary"
                      onClick={() => chooseDeleteMode(true)}
                      disabled={deleting}
                    >
                      Да, удалить товары
                    </button>
                    <button
                      className="btn btn--outline"
                      onClick={() => chooseDeleteMode(false)}
                      disabled={deleting}
                    >
                      Нет, только категорию
                    </button>
                  </div>
                  <div className="admin-modal__footer">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={closeDeleteModal}
                      disabled={deleting}
                    >
                      Отмена
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="admin-modal__title">Точно удалить?</h3>
                  <p className="admin-modal__text">
                    Категория будет удалена.{" "}
                    {deleteState.deleteProducts
                      ? "Товары этой категории также будут удалены."
                      : "Товары будут скрыты и отвязаны от категории."}
                  </p>
                  <div className="admin-modal__actions">
                    <button
                      className="btn btn--primary"
                      onClick={confirmDelete}
                      disabled={deleting}
                    >
                      Удалить
                    </button>
                    <button
                      className="btn btn--outline"
                      onClick={closeDeleteModal}
                      disabled={deleting}
                    >
                      Отмена
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategoriesPage;
