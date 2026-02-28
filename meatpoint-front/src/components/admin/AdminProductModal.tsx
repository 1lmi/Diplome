import React, { useEffect, useMemo, useState } from "react";
import type { AdminProduct } from "../../types";

interface SizeDraft {
  id?: number;
  name: string;
  amount: string;
  unit: string;
  price: string;
  is_hidden?: boolean;
}

interface Props {
  product: AdminProduct | null;
  onClose: () => void;
  onSave: (
    productId: number,
    payload: {
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
  ) => Promise<void>;
  saving: boolean;
}

type EditorTab = "main" | "nutrition" | "sizes";

const EDITOR_SECTIONS: { id: EditorTab; label: string; subtitle: string }[] = [
  { id: "main", label: "Основные", subtitle: "Основные настройки" },
  { id: "nutrition", label: "КБЖУ товара", subtitle: "Пищевая ценность на 100 г" },
  { id: "sizes", label: "Цены и варианты", subtitle: "Размеры, стоимость и видимость" },
];

const AdminProductModal: React.FC<Props> = ({ product, onClose, onSave, saving }) => {
  const [activeTab, setActiveTab] = useState<EditorTab>("main");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isHidden, setIsHidden] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [sizes, setSizes] = useState<SizeDraft[]>([]);
  const [removeSizeIds, setRemoveSizeIds] = useState<number[]>([]);
  const [file, setFile] = useState<File | undefined>();
  const [closing, setClosing] = useState(false);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description || "");
    setSortOrder(String(product.sort_order ?? 0));
    setIsHidden(!!product.is_hidden);
    setIsActive(!!product.is_active);
    setSizes(
      product.sizes.map((s) => ({
        id: s.id,
        name: s.name || "",
        amount: s.amount !== null && s.amount !== undefined ? String(s.amount) : "",
        unit: s.unit || "",
        price: String(s.price),
        is_hidden: s.is_hidden,
      }))
    );
    const base = product.sizes[0];
    setCalories(base?.calories != null ? String(base.calories) : "");
    setProtein(base?.protein != null ? String(base.protein) : "");
    setFat(base?.fat != null ? String(base.fat) : "");
    setCarbs(base?.carbs != null ? String(base.carbs) : "");
    setRemoveSizeIds([]);
    setFile(undefined);
    setClosing(false);
    setActiveTab("main");
  }, [product]);

  const imagePreview = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return product?.image_url || "";
  }, [file, product]);

  useEffect(() => {
    return () => {
      if (file) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [file, imagePreview]);

  if (!product) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  const handleRemoveSize = (idx: number) => {
    const draft = sizes[idx];
    if (draft?.id) {
      setRemoveSizeIds((prev) => [...prev, draft.id!]);
    }
    setSizes((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSize = (idx: number, patch: Partial<SizeDraft>) => {
    setSizes((prev) => prev.map((size, i) => (i === idx ? { ...size, ...patch } : size)));
  };

  const handleSave = async () => {
    const preparedSizes = sizes
      .filter((s) => s.name.trim() && s.price.trim())
      .map((s) => ({
        id: s.id,
        size_name: s.name.trim(),
        amount: s.amount ? Number(s.amount) : null,
        unit: s.unit.trim() || null,
        price: Number(s.price),
        is_hidden: !!s.is_hidden,
        calories: calories ? Number(calories) : null,
        protein: protein ? Number(protein) : null,
        fat: fat ? Number(fat) : null,
        carbs: carbs ? Number(carbs) : null,
      }));

    await onSave(product.id, {
      name: name.trim() || product.name,
      description: description.trim() ? description.trim() : null,
      sort_order: Number(sortOrder) || 0,
      is_hidden: isHidden,
      is_active: isActive,
      sizes: preparedSizes,
      remove_size_ids: removeSizeIds,
      image_file: file,
    });
  };

  const activeSection =
    EDITOR_SECTIONS.find((section) => section.id === activeTab) ?? EDITOR_SECTIONS[0];

  return (
    <div
      className="modal-backdrop"
      data-leave={closing ? "true" : undefined}
      onClick={handleClose}
    >
      <div
        className="modal modal--wide admin-edit-modal-shell"
        data-leave={closing ? "true" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose}>
          ×
        </button>
        <div className="modal__content admin-edit-modal">
          <aside className="admin-edit-modal__sidebar">
            <div className="admin-edit-modal__media">
              <div className="admin-edit-modal__image-frame">
                {imagePreview ? (
                  <img className="admin-edit-modal__image" src={imagePreview} alt={product.name} />
                ) : (
                  <div className="admin-edit-modal__image-placeholder">Фото не загружено</div>
                )}
              </div>
              <label className="admin-edit-modal__photo-button">
                Изменить фото
                <input
                  className="admin-edit-modal__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || undefined)}
                />
              </label>
            </div>

            <div className="admin-edit-modal__nav" role="tablist" aria-label="Разделы товара">
              {EDITOR_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`admin-edit-modal__nav-button${
                    activeTab === section.id ? " admin-edit-modal__nav-button--active" : ""
                  }`}
                  onClick={() => setActiveTab(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </aside>

          <div className="modal__info admin-edit-modal__panel">
            <div className="admin-edit-modal__header">
              <h2 className="modal__title">Редактирование товара</h2>
              <p className="modal__subtitle">{activeSection.subtitle}</p>
            </div>

            <div className="admin-edit-modal__body">
              {activeTab === "main" && (
                <div className="admin-edit-modal__section stack gap-12">
                  <label className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Название позиции</span>
                    <input
                      className="input admin-edit-modal__input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Введите название товара"
                    />
                  </label>

                  <label className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Описание</span>
                    <textarea
                      className="input admin-edit-modal__input admin-edit-modal__textarea"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Кратко опишите товар"
                    />
                  </label>

                  <label className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Порядок</span>
                    <input
                      className="input admin-edit-modal__input"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                      type="number"
                      placeholder="0"
                    />
                  </label>

                  <div className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Статус товара</span>
                    <div className="admin-edit-modal__toggle-grid">
                      <label className="checkbox admin-edit-modal__toggle">
                        <input
                          type="checkbox"
                          checked={!isActive}
                          onChange={(e) => setIsActive(!e.target.checked)}
                        />
                        <span>Отключить товар</span>
                      </label>
                      <label className="checkbox admin-edit-modal__toggle">
                        <input
                          type="checkbox"
                          checked={isHidden}
                          onChange={(e) => setIsHidden(e.target.checked)}
                        />
                        <span>Скрыть из меню</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "nutrition" && (
                <div className="admin-edit-modal__section stack gap-12">
                  <p className="admin-edit-modal__section-note">
                    Значения применяются ко всем вариантам этого товара.
                  </p>
                  <div className="admin-edit-modal__nutrition-grid">
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Ккал</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Белки</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={protein}
                        onChange={(e) => setProtein(e.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Жиры</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={fat}
                        onChange={(e) => setFat(e.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Углеводы</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={carbs}
                        onChange={(e) => setCarbs(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {activeTab === "sizes" && (
                <div className="admin-edit-modal__section stack gap-12">
                  <p className="admin-edit-modal__section-note">
                    Здесь настраиваются размеры, цена и видимость каждого варианта.
                  </p>

                  <div className="admin-edit-modal__sizes-list">
                    {sizes.length === 0 && (
                      <div className="admin-edit-modal__empty">
                        Добавьте первый вариант, чтобы товар можно было заказать.
                      </div>
                    )}

                    {sizes.map((s, idx) => (
                      <div key={s.id || idx} className="admin-size-row admin-edit-modal__size-card">
                        <div className="admin-edit-modal__size-grid">
                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Название</span>
                            <input
                              className="input admin-edit-modal__input"
                              placeholder="Например, Стандарт"
                              value={s.name}
                              onChange={(e) => updateSize(idx, { name: e.target.value })}
                            />
                          </label>
                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Размер</span>
                            <input
                              className="input admin-edit-modal__input"
                              type="number"
                              placeholder="0"
                              value={s.amount}
                              onChange={(e) => updateSize(idx, { amount: e.target.value })}
                            />
                          </label>
                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Единица</span>
                            <input
                              className="input admin-edit-modal__input"
                              placeholder="г, мл, шт"
                              value={s.unit}
                              onChange={(e) => updateSize(idx, { unit: e.target.value })}
                            />
                          </label>
                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Цена</span>
                            <input
                              className="input admin-edit-modal__input"
                              type="number"
                              placeholder="0"
                              value={s.price}
                              onChange={(e) => updateSize(idx, { price: e.target.value })}
                            />
                          </label>
                        </div>

                        <div className="admin-edit-modal__size-actions">
                          <label className="checkbox admin-edit-modal__toggle admin-edit-modal__toggle--inline">
                            <input
                              type="checkbox"
                              checked={!!s.is_hidden}
                              onChange={(e) => updateSize(idx, { is_hidden: e.target.checked })}
                            />
                            <span>Скрыт в меню</span>
                          </label>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleRemoveSize(idx)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn--outline btn--sm admin-edit-modal__add-size"
                    onClick={() =>
                      setSizes((prev) => [...prev, { name: "", amount: "", unit: "", price: "" }])
                    }
                  >
                    + Добавить размер
                  </button>
                </div>
              )}
            </div>

            <div className="panel__actions admin-edit-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={handleClose}>
                Закрыть
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                Сохранить изменения
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProductModal;
