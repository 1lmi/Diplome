import React, { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AdminCategory, Category } from "../../types";
import { focusFirstInvalidField } from "../../utils/forms";

interface Props {
  categories: AdminCategory[];
  newCategory: { name: string };
  onNewCategoryChange: (field: "name", value: string) => void;
  onCreateCategory: () => Promise<void> | void;
  onUpdateCategory: (id: number, payload: Partial<Category>) => Promise<void>;
  onDeleteCategory: (id: number, deleteProducts: boolean) => Promise<void>;
  onReorderCategories: (categoryIds: number[]) => Promise<void>;
  saving: boolean;
}

interface SortableCardProps {
  category: AdminCategory;
  draft: Category;
  index: number;
  error?: string;
  saving: boolean;
  onDraftChange: (
    id: number,
    field: keyof Category,
    value: string | number | boolean | null
  ) => void;
  onSave: (id: number) => Promise<void>;
  onDelete: (category: AdminCategory) => void;
}

const SortableCategoryCard: React.FC<SortableCardProps> = ({
  category,
  draft,
  index,
  error,
  saving,
  onDraftChange,
  onSave,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={"category-card category-card--sortable" + (isDragging ? " category-card--dragging" : "")}
    >
      <div className="category-card__handle-col">
        <button
          type="button"
          className="sortable-handle"
          aria-label={`Переместить категорию ${category.name}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className="profile-badge">#{index + 1}</span>
      </div>

      <div className="category-card__fields">
        <label className="field">
          <span>Название</span>
          <input
            id={`category-name-${category.id}`}
            className="input"
            value={draft.name}
            aria-invalid={error ? "true" : "false"}
            onChange={(e) => onDraftChange(category.id, "name", e.target.value)}
          />
          {error ? <p className="field-note field-note--error">{error}</p> : null}
        </label>
      </div>

      <div className="category-card__side">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!draft.is_hidden}
            onChange={(e) => onDraftChange(category.id, "is_hidden", !e.target.checked)}
          />
          <span>Активна</span>
        </label>
        <div className="category-card__actions">
          <button
            className={"btn btn--primary btn--sm" + (saving ? " btn--loading" : "")}
            onClick={() => onSave(category.id)}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="btn__spinner" />
                Сохраняем
              </>
            ) : (
              "Сохранить"
            )}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => onDelete(category)}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminCategoriesPage: React.FC<Props> = ({
  categories,
  newCategory,
  onNewCategoryChange,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  saving,
}) => {
  const [drafts, setDrafts] = useState<Record<number, Category>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<number, string>>({});
  const [deleteState, setDeleteState] = useState<{
    category: AdminCategory;
    deleteProducts: boolean | null;
    step: "choice" | "confirm";
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    const map: Record<number, Category> = {};
    categories.forEach((cat) => {
      map[cat.id] = {
        id: cat.id,
        name: cat.name,
        description: null,
        sort_order: cat.sort_order,
        is_hidden: cat.is_hidden,
      };
    });
    setDrafts(map);
  }, [categories]);

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );

  const handleDraftChange = (
    id: number,
    field: keyof Category,
    value: string | number | boolean | null
  ) => {
    setDraftErrors((prev) => {
      const next = { ...prev };
      if (field === "name") {
        delete next[id];
      }
      return next;
    });
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleCreate = async () => {
    if (!newCategory.name.trim()) {
      setNewCategoryError("Название категории обязательно.");
      window.setTimeout(() => focusFirstInvalidField(["#new-category-name"]), 0);
      return;
    }

    setNewCategoryError(null);
    try {
      await onCreateCategory();
    } catch {
      // Parent handles error presentation.
    }
  };

  const handleSave = async (id: number) => {
    const draft = drafts[id];
    if (!draft) return;
    if (!draft.name?.trim()) {
      setDraftErrors((prev) => ({ ...prev, [id]: "Название категории обязательно." }));
      window.setTimeout(() => focusFirstInvalidField([`#category-name-${id}`]), 0);
      return;
    }

    setSavingId(id);
    try {
      await onUpdateCategory(id, {
        name: draft.name.trim(),
        description: null,
        is_hidden: draft.is_hidden,
      });
    } catch {
      // Parent handles error presentation.
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
    setDeleteState((prev) => (prev ? { ...prev, deleteProducts, step: "confirm" } : prev));
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = sortedCats.map((category) => category.id);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setReordering(true);
    try {
      await onReorderCategories(arrayMove(ids, oldIndex, newIndex));
    } catch {
      // Parent handles error presentation.
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Управление категориями</p>
          <h2 className="admin-page__title">Структура меню</h2>
          <p className="muted">Перетаскивайте категории, редактируйте названия и сразу сохраняйте.</p>
        </div>
      </div>

      <div className="panel menu-form">
        <div className="panel__header">
          <div>
            <h3>Новая категория</h3>
            <p className="muted">Новая категория автоматически попадёт в конец списка.</p>
          </div>
          <button
            className={"btn btn--primary" + (saving ? " btn--loading" : "")}
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="btn__spinner" />
                Добавляем
              </>
            ) : (
              "Добавить"
            )}
          </button>
        </div>

        <div className="form-feedback">
          {newCategoryError ? (
            <div className="alert alert--error form-feedback__summary">{newCategoryError}</div>
          ) : null}
          <div className="grid grid-2 gap-8">
            <label className="field">
              <span>Название</span>
              <input
                id="new-category-name"
                className="input"
                placeholder="Например, Горячее"
                value={newCategory.name}
                aria-invalid={newCategoryError ? "true" : "false"}
                onChange={(e) => {
                  setNewCategoryError(null);
                  onNewCategoryChange("name", e.target.value);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="category-list">
        <div className="category-list__header">
          <div>
            <h3>Порядок категорий</h3>
            <p className="muted">Тяните за ручку слева. Ручная сортировка числами больше не нужна.</p>
          </div>
          {reordering ? <span className="profile-badge profile-badge--accent">Сохраняем порядок…</span> : null}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedCats.map((cat) => cat.id)} strategy={verticalListSortingStrategy}>
            <div className="category-list">
              {sortedCats.map((cat, index) => (
                <SortableCategoryCard
                  key={cat.id}
                  category={cat}
                  draft={drafts[cat.id] || cat}
                  index={index}
                  error={draftErrors[cat.id]}
                  saving={savingId === cat.id}
                  onDraftChange={handleDraftChange}
                  onSave={handleSave}
                  onDelete={openDeleteModal}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {deleteState && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal__close" onClick={closeDeleteModal} disabled={deleting}>
              ×
            </button>
            <div className="admin-modal__content">
              {deleteState.step === "choice" ? (
                <>
                  <h3 className="admin-modal__title">
                    Удалить категорию "{deleteState.category.name}"?
                  </h3>
                  <p className="admin-modal__text">Нужно ли удалить все товары внутри неё?</p>
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
                  </div>
                </>
              ) : (
                <>
                  <h3 className="admin-modal__title">Подтвердите удаление</h3>
                  <p className="admin-modal__text">
                    Категория будет удалена.{" "}
                    {deleteState.deleteProducts
                      ? "Товары этой категории также будут удалены."
                      : "Товары будут скрыты и отвязаны от категории."}
                  </p>
                  <div className="admin-modal__actions">
                    <button
                      className={"btn btn--primary" + (deleting ? " btn--loading" : "")}
                      onClick={confirmDelete}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <>
                          <span className="btn__spinner" />
                          Удаляем
                        </>
                      ) : (
                        "Удалить"
                      )}
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
