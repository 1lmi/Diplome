import React, { useEffect, useMemo, useState } from "react";
import type { AdminCategory, Category } from "../../types";

interface Props {
  categories: AdminCategory[];
  newCategory: { name: string; description: string };
  onNewCategoryChange: (field: "name" | "description", value: string) => void;
  onCreateCategory: () => Promise<void> | void;
  onUpdateCategory: (id: number, payload: Partial<Category>) => Promise<void>;
  onDeleteCategory: (id: number) => Promise<void>;
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

      <div className="stack gap-10">
        {sortedCats.map((cat) => {
          const draft = drafts[cat.id] || cat;
          return (
            <div key={cat.id} className="panel">
              <div className="panel__header">
                <div>
                  <h3>{cat.name}</h3>
                  <p className="muted">Сортировка: {cat.sort_order}</p>
                </div>
                <div className="panel__actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      if (window.confirm(`Удалить категорию “${cat.name}” и скрыть все её товары?`)) {
                        onDeleteCategory(cat.id);
                      }
                    }}
                  >
                    Удалить
                  </button>
                  <button
                    className="chip chip--ghost"
                    onClick={() => handleDraftChange(cat.id, "is_hidden", !draft.is_hidden)}
                  >
                    {draft.is_hidden ? "Показать" : "Скрыть"}
                  </button>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleSave(cat.id)}
                    disabled={savingId === cat.id}
                  >
                    {savingId === cat.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
              <div className="grid grid-3 gap-8">
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
                <label className="field">
                  <span>Сортировка</span>
                  <input
                    className="input"
                    type="number"
                    value={draft.sort_order}
                    onChange={(e) => handleDraftChange(cat.id, "sort_order", Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminCategoriesPage;
