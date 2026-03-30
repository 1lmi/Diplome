import React, { useEffect, useMemo, useState } from "react";
import type { AdminProduct } from "../../types";
import { focusFirstInvalidField } from "../../utils/forms";

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
  { id: "main", label: "Основное", subtitle: "Название, описание, фото и статус товара" },
  { id: "nutrition", label: "КБЖУ", subtitle: "Пищевая ценность применяется ко всем размерам" },
  { id: "sizes", label: "Размеры", subtitle: "Цены, размеры и видимость каждого варианта" },
];

const AdminProductModal: React.FC<Props> = ({ product, onClose, onSave, saving }) => {
  const [activeTab, setActiveTab] = useState<EditorTab>("main");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description || "");
    setIsHidden(!!product.is_hidden);
    setIsActive(!!product.is_active);
    setSizes(
      product.sizes.map((size) => ({
        id: size.id,
        name: size.name || "",
        amount: size.amount !== null && size.amount !== undefined ? String(size.amount) : "",
        unit: size.unit || "",
        price: String(size.price),
        is_hidden: size.is_hidden,
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
    setFormError(null);
    setFieldErrors({});
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
    if (saving) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  const handleRemoveSize = (idx: number) => {
    const draft = sizes[idx];
    if (draft?.id) {
      setRemoveSizeIds((prev) => [...prev, draft.id!]);
    }
    setSizes((prev) => prev.filter((_, index) => index !== idx));
  };

  const updateSize = (idx: number, patch: Partial<SizeDraft>) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`size-${idx}-name`];
      delete next[`size-${idx}-price`];
      delete next.sizes;
      return next;
    });
    setSizes((prev) => prev.map((size, index) => (index === idx ? { ...size, ...patch } : size)));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Название товара обязательно.";
    }

    let validSizes = 0;
    sizes.forEach((size, idx) => {
      const hasAnyValue = [size.name, size.amount, size.unit, size.price].some((value) => value.trim());
      const hasName = size.name.trim().length > 0;
      const hasPrice = size.price.trim().length > 0;

      if (hasName && hasPrice) {
        validSizes += 1;
      }

      if (hasAnyValue && !hasName) {
        errors[`size-${idx}-name`] = "Укажите название варианта.";
      }

      if (hasAnyValue && !hasPrice) {
        errors[`size-${idx}-price`] = "Укажите цену.";
      }
    });

    if (validSizes === 0) {
      errors.sizes = "Добавьте хотя бы один размер с названием и ценой.";
    }

    return errors;
  };

  const handleSave = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Проверьте поля товара перед сохранением.");
      if (errors.name) {
        setActiveTab("main");
      } else {
        setActiveTab("sizes");
      }
      window.setTimeout(() => {
        focusFirstInvalidField(
          [
            errors.name ? "#admin-product-name" : "",
            errors["size-0-name"] || errors.sizes ? "#admin-size-name-0" : "",
            errors["size-0-price"] ? "#admin-size-price-0" : "",
          ].filter(Boolean)
        );
      }, 0);
      return;
    }

    setFormError(null);
    setFieldErrors({});

    const preparedSizes = sizes
      .filter((size) => size.name.trim() && size.price.trim())
      .map((size) => ({
        id: size.id,
        size_name: size.name.trim(),
        amount: size.amount ? Number(size.amount) : null,
        unit: size.unit.trim() || null,
        price: Number(size.price),
        is_hidden: !!size.is_hidden,
        calories: calories ? Number(calories) : null,
        protein: protein ? Number(protein) : null,
        fat: fat ? Number(fat) : null,
        carbs: carbs ? Number(carbs) : null,
      }));

    try {
      await onSave(product.id, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        sort_order: product.sort_order,
        is_hidden: isHidden,
        is_active: isActive,
        sizes: preparedSizes,
        remove_size_ids: removeSizeIds,
        image_file: file,
      });
    } catch {
      // Parent handles error presentation.
    }
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
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose} disabled={saving}>
          ×
        </button>
        <div className="modal__content admin-edit-modal">
          <aside className="admin-edit-modal__sidebar">
            <div className="admin-edit-modal__media">
              <div className="admin-edit-modal__image-frame">
                {imagePreview ? (
                  <img className="admin-edit-modal__image" src={imagePreview} alt={product.name} />
                ) : (
                  <div className="admin-edit-modal__image-placeholder">Фото пока не загружено</div>
                )}
              </div>

              <label className="admin-edit-modal__photo-button">
                Обновить фото
                <input
                  className="admin-edit-modal__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] || undefined)}
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
              {formError ? <div className="alert alert--error">{formError}</div> : null}

              {activeTab === "main" ? (
                <div className="admin-edit-modal__section stack gap-12">
                  <label className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Название позиции</span>
                    <input
                      id="admin-product-name"
                      className="input admin-edit-modal__input"
                      value={name}
                      aria-invalid={fieldErrors.name ? "true" : "false"}
                      onChange={(event) => {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.name;
                          return next;
                        });
                        setName(event.target.value);
                      }}
                      placeholder="Введите название товара"
                    />
                    {fieldErrors.name ? (
                      <p className="field-note field-note--error">{fieldErrors.name}</p>
                    ) : null}
                  </label>

                  <label className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Описание</span>
                    <textarea
                      className="input admin-edit-modal__input admin-edit-modal__textarea"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Кратко опишите товар"
                    />
                  </label>

                  <div className="admin-edit-modal__field">
                    <span className="admin-edit-modal__label">Статус товара</span>
                    <div className="admin-edit-modal__toggle-grid">
                      <label className="checkbox admin-edit-modal__toggle">
                        <input
                          type="checkbox"
                          checked={!isActive}
                          onChange={(event) => setIsActive(!event.target.checked)}
                        />
                        <span>Отключить товар</span>
                      </label>
                      <label className="checkbox admin-edit-modal__toggle">
                        <input
                          type="checkbox"
                          checked={isHidden}
                          onChange={(event) => setIsHidden(event.target.checked)}
                        />
                        <span>Скрыть из меню</span>
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "nutrition" ? (
                <div className="admin-edit-modal__section stack gap-12">
                  <p className="admin-edit-modal__section-note">
                    Эти значения используются для всех размеров данного товара.
                  </p>
                  <div className="admin-edit-modal__nutrition-grid">
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Ккал</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={calories}
                        onChange={(event) => setCalories(event.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Белки</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={protein}
                        onChange={(event) => setProtein(event.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Жиры</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={fat}
                        onChange={(event) => setFat(event.target.value)}
                      />
                    </label>
                    <label className="admin-edit-modal__field">
                      <span className="admin-edit-modal__label">Углеводы</span>
                      <input
                        className="input admin-edit-modal__input"
                        type="number"
                        placeholder="0"
                        value={carbs}
                        onChange={(event) => setCarbs(event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {activeTab === "sizes" ? (
                <div className="admin-edit-modal__section stack gap-12">
                  <p className="admin-edit-modal__section-note">
                    Минимум один размер должен иметь название и цену. Порядок товара задаётся вне
                    модалки перетаскиванием.
                  </p>

                  {fieldErrors.sizes ? <div className="alert alert--error">{fieldErrors.sizes}</div> : null}

                  <div className="admin-edit-modal__sizes-list">
                    {sizes.length === 0 ? (
                      <div className="admin-edit-modal__empty">
                        Добавьте первый размер, чтобы товар можно было заказать.
                      </div>
                    ) : null}

                    {sizes.map((size, idx) => (
                      <div key={size.id || idx} className="admin-size-row admin-edit-modal__size-card">
                        <div className="admin-edit-modal__size-grid">
                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Название</span>
                            <input
                              id={`admin-size-name-${idx}`}
                              className="input admin-edit-modal__input"
                              placeholder="Например, Стандарт"
                              value={size.name}
                              aria-invalid={fieldErrors[`size-${idx}-name`] ? "true" : "false"}
                              onChange={(event) => updateSize(idx, { name: event.target.value })}
                            />
                            {fieldErrors[`size-${idx}-name`] ? (
                              <p className="field-note field-note--error">{fieldErrors[`size-${idx}-name`]}</p>
                            ) : null}
                          </label>

                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Размер</span>
                            <input
                              className="input admin-edit-modal__input"
                              type="number"
                              placeholder="0"
                              value={size.amount}
                              onChange={(event) => updateSize(idx, { amount: event.target.value })}
                            />
                          </label>

                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Единица</span>
                            <input
                              className="input admin-edit-modal__input"
                              placeholder="г, мл, шт"
                              value={size.unit}
                              onChange={(event) => updateSize(idx, { unit: event.target.value })}
                            />
                          </label>

                          <label className="admin-edit-modal__field">
                            <span className="admin-edit-modal__label">Цена</span>
                            <input
                              id={`admin-size-price-${idx}`}
                              className="input admin-edit-modal__input"
                              type="number"
                              placeholder="0"
                              value={size.price}
                              aria-invalid={fieldErrors[`size-${idx}-price`] ? "true" : "false"}
                              onChange={(event) => updateSize(idx, { price: event.target.value })}
                            />
                            {fieldErrors[`size-${idx}-price`] ? (
                              <p className="field-note field-note--error">{fieldErrors[`size-${idx}-price`]}</p>
                            ) : null}
                          </label>
                        </div>

                        <div className="admin-edit-modal__size-actions">
                          <label className="checkbox admin-edit-modal__toggle admin-edit-modal__toggle--inline">
                            <input
                              type="checkbox"
                              checked={!!size.is_hidden}
                              onChange={(event) => updateSize(idx, { is_hidden: event.target.checked })}
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
              ) : null}
            </div>

            <div className="panel__actions admin-edit-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>
                Закрыть
              </button>
              <button
                type="button"
                className={"btn btn--primary" + (saving ? " btn--loading" : "")}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="btn__spinner" />
                    Сохраняем
                  </>
                ) : (
                  "Сохранить изменения"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProductModal;
