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
import type { AdminCategory, AdminProduct } from "../../types";
import { focusFirstInvalidField } from "../../utils/forms";

type DraftSize = { name: string; amount: string; unit: string; price: string };
type MenuFormStepKey = "basic" | "nutrition" | "pricing";

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
    sizes: DraftSize[];
  };
  onNewProductChange: (field: string, value: any) => void;
  onCreateProduct: () => Promise<void>;
  onToggleProduct: (product: AdminProduct) => Promise<void>;
  onReorderProducts: (categoryId: number, productIds: number[]) => Promise<void>;
  onDelete: (productId: number) => Promise<void>;
  onEdit: (product: AdminProduct) => void;
  saving: boolean;
  onRefresh: () => void;
}

interface SortableRowProps {
  product: AdminProduct;
  busy: boolean;
  onToggle: (product: AdminProduct) => Promise<void>;
  onDelete: (product: AdminProduct) => void;
  onEdit: (product: AdminProduct) => void;
}

const formSteps: Array<{ key: MenuFormStepKey; label: string; helper: string }> = [
  { key: "basic", label: "Основное", helper: "Категория, название, описание, фото" },
  { key: "nutrition", label: "КБЖУ", helper: "Необязательный шаг" },
  { key: "pricing", label: "Цены", helper: "Размеры, вес и стоимость" },
];

const emptySize = (): DraftSize => ({ name: "", amount: "", unit: "", price: "" });

const SortableProductRow: React.FC<SortableRowProps> = ({
  product,
  busy,
  onToggle,
  onDelete,
  onEdit,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={"menu-product-row" + (isDragging ? " menu-product-row--dragging" : "")}
    >
      <div className="menu-product-row__handle-col">
        <button
          type="button"
          className="sortable-handle"
          aria-label={`Переместить товар ${product.name}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      </div>

      <div className="menu-product-row__media">
        <img src={product.image_url} alt={product.name} />
      </div>

      <div className="menu-product-row__main">
        <div className="menu-product-row__top">
          <div>
            <div className="menu-product-row__title">{product.name}</div>
            {product.description ? <div className="menu-product-row__desc">{product.description}</div> : null}
          </div>
          <div className="menu-product-row__badges">
            {!product.is_active ? <span className="chip chip--ghost">Отключен</span> : null}
            {product.is_hidden ? <span className="chip chip--ghost">Скрыт</span> : null}
            <span className="profile-badge">#{product.sort_order + 1}</span>
          </div>
        </div>

        <div className="menu-product-row__sizes">
          {product.sizes.map((size) => {
            const amountLabel =
              size.amount !== null && size.amount !== undefined && size.amount !== 0
                ? `${size.amount}${size.unit ? ` ${size.unit}` : ""}`
                : "без объема";

            return (
              <span key={size.id} className="chip chip--ghost">
                {(size.name || "Размер") + " · " + amountLabel + " · " + size.price + " ₽"}
              </span>
            );
          })}
        </div>
      </div>

      <div className="menu-product-row__actions">
        <button
          type="button"
          className={"btn btn--outline btn--sm" + (busy ? " btn--loading" : "")}
          onClick={() => onToggle(product)}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="btn__spinner" />
              Сохраняем
            </>
          ) : product.is_hidden ? (
            "Показать"
          ) : (
            "Скрыть"
          )}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(product)} disabled={busy}>
          Удалить
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit(product)} disabled={busy}>
          Редактировать
        </button>
      </div>
    </div>
  );
};

const AdminMenuPage: React.FC<Props> = ({
  categories,
  categoriesOptions,
  newProduct,
  onNewProductChange,
  onCreateProduct,
  onToggleProduct,
  onReorderProducts,
  onDelete,
  onEdit,
  saving,
}) => {
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [reorderingCategoryId, setReorderingCategoryId] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState<MenuFormStepKey>("basic");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );

  const previewImageUrl = useMemo(
    () => (newProduct.file ? URL.createObjectURL(newProduct.file) : null),
    [newProduct.file]
  );

  useEffect(() => {
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  const clearFieldError = (key: string) => {
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateSizeDraft = (idx: number, patch: Partial<DraftSize>) => {
    const next = [...newProduct.sizes];
    next[idx] = { ...next[idx], ...patch };
    onNewProductChange("sizes", next);
  };

  const getErrorStep = (errors: Record<string, string>): MenuFormStepKey => {
    if (errors.categoryId || errors.name) return "basic";
    if (Object.keys(errors).some((key) => key.startsWith("size-")) || errors.sizes) return "pricing";
    return "basic";
  };

  const validateCreateProduct = () => {
    const errors: Record<string, string> = {};
    if (!newProduct.categoryId) errors.categoryId = "Выберите категорию.";
    if (!newProduct.name.trim()) errors.name = "Название товара обязательно.";

    let validSizes = 0;
    newProduct.sizes.forEach((size, idx) => {
      const hasAnyValue = [size.name, size.amount, size.unit, size.price].some((value) => value.trim());
      const hasName = size.name.trim().length > 0;
      const hasPrice = size.price.trim().length > 0;

      if (hasName && hasPrice) validSizes += 1;
      if (hasAnyValue && !hasName) errors[`size-${idx}-name`] = "Укажите название размера.";
      if (hasAnyValue && !hasPrice) errors[`size-${idx}-price`] = "Укажите цену.";
    });

    if (validSizes === 0) {
      errors.sizes = "Добавьте хотя бы один вариант размера с названием и ценой.";
    }

    return errors;
  };

  const handleCreateClick = async () => {
    const errors = validateCreateProduct();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const errorStep = getErrorStep(errors);
      setActiveStep(errorStep);
      window.setTimeout(() => {
        focusFirstInvalidField(
          [
            errors.categoryId ? "#new-product-category" : "",
            errors.name ? "#new-product-name" : "",
            errors["size-0-name"] || errors.sizes ? "#new-product-size-name-0" : "",
            errors["size-0-price"] ? "#new-product-size-price-0" : "",
          ].filter(Boolean)
        );
      }, 0);
      return;
    }

    setFormErrors({});
    try {
      await onCreateProduct();
      setActiveStep("basic");
      setIsCreateModalOpen(false);
    } catch {
      // Parent handles error presentation.
    }
  };

  const openCreateModal = () => {
    setFormErrors({});
    setActiveStep("basic");
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (saving) return;
    setIsCreateModalOpen(false);
    setFormErrors({});
    setActiveStep("basic");
  };

  const openDeleteModal = (product: AdminProduct) => setDeleteTarget(product);

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
    } catch {
      // Parent handles error presentation.
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (product: AdminProduct) => {
    setBusyProductId(product.id);
    try {
      await onToggleProduct(product);
    } catch {
      // Parent handles error presentation.
    } finally {
      setBusyProductId(null);
    }
  };

  const handleDragEnd = async (categoryId: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const category = sortedCategories.find((item) => item.id === categoryId);
    if (!category) return;
    const ids = category.products.map((product) => product.id);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setReorderingCategoryId(categoryId);
    try {
      await onReorderProducts(categoryId, arrayMove(ids, oldIndex, newIndex));
    } catch {
      // Parent handles error presentation.
    } finally {
      setReorderingCategoryId(null);
    }
  };

  const activeStepIndex = formSteps.findIndex((step) => step.key === activeStep);

  const goToPrevStep = () => {
    if (activeStepIndex <= 0) return;
    setActiveStep(formSteps[activeStepIndex - 1].key);
  };

  const goToNextStep = () => {
    if (activeStepIndex >= formSteps.length - 1) return;
    setActiveStep(formSteps[activeStepIndex + 1].key);
  };

  const getStepState = (stepKey: MenuFormStepKey) => {
    if (formErrors.categoryId || formErrors.name) {
      if (stepKey === "basic") return "error";
    }
    if (Object.keys(formErrors).some((key) => key.startsWith("size-")) || formErrors.sizes) {
      if (stepKey === "pricing") return "error";
    }
    if (stepKey === activeStep) return "active";
    return "idle";
  };

  const renderFormStep = () => {
    if (activeStep === "basic") {
      return (
        <div className="menu-form__step-card">
          <div className="menu-form__section">
            <div className="menu-form__section-title">Основное</div>
            <div className="menu-form__basic-layout">
              <div className="menu-form__image-panel">
                <div className="menu-form__image-preview">
                  {previewImageUrl ? (
                    <img src={previewImageUrl} alt={newProduct.name || "Предпросмотр фото"} />
                  ) : (
                    <div className="menu-form__image-placeholder">Фото товара</div>
                  )}
                </div>
                <label className="field">
                  <span>Фото</span>
                  <input
                    className="input input--file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => onNewProductChange("file", e.target.files?.[0])}
                  />
                </label>
              </div>

              <div className="menu-form__fields">
                <label className="field">
                  <span>Категория</span>
                  <select
                    id="new-product-category"
                    className="input"
                    value={newProduct.categoryId}
                    aria-invalid={formErrors.categoryId ? "true" : "false"}
                    onChange={(e) => {
                      clearFieldError("categoryId");
                      onNewProductChange("categoryId", e.target.value);
                    }}
                  >
                    <option value="">Выберите категорию</option>
                    {categoriesOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.categoryId ? (
                    <p className="field-note field-note--error">{formErrors.categoryId}</p>
                  ) : null}
                </label>

                <label className="field">
                  <span>Название</span>
                  <input
                    id="new-product-name"
                    className="input"
                    placeholder="Например, Острая"
                    value={newProduct.name}
                    aria-invalid={formErrors.name ? "true" : "false"}
                    onChange={(e) => {
                      clearFieldError("name");
                      onNewProductChange("name", e.target.value);
                    }}
                  />
                  {formErrors.name ? <p className="field-note field-note--error">{formErrors.name}</p> : null}
                </label>

                <label className="field menu-form__field--full">
                  <span>Описание</span>
                  <textarea
                    className="textarea"
                    rows={5}
                    placeholder="Кратко опишите товар"
                    value={newProduct.description}
                    onChange={(e) => onNewProductChange("description", e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeStep === "nutrition") {
      return (
        <div className="menu-form__step-card">
          <div className="menu-form__section">
            <div className="menu-form__section-title">КБЖУ на 100 г</div>
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
      );
    }

    return (
      <div className="menu-form__step-card">
        <div className="menu-form__section">
          <div className="menu-form__section-title">Цены</div>
          {formErrors.sizes ? <div className="alert alert--error">{formErrors.sizes}</div> : null}

          <div className="menu-form__sizes">
            {newProduct.sizes.map((size, idx) => (
              <div key={idx} className="menu-size-row">
                <div className="menu-size-row__fields">
                  <label className="field">
                    <span>Название размера</span>
                    <input
                      id={`new-product-size-name-${idx}`}
                      className="input"
                      placeholder="S, M, L или Стандарт"
                      value={size.name}
                      aria-invalid={formErrors[`size-${idx}-name`] ? "true" : "false"}
                      onChange={(e) => {
                        clearFieldError(`size-${idx}-name`);
                        clearFieldError("sizes");
                        updateSizeDraft(idx, { name: e.target.value });
                      }}
                    />
                    {formErrors[`size-${idx}-name`] ? (
                      <p className="field-note field-note--error">{formErrors[`size-${idx}-name`]}</p>
                    ) : null}
                  </label>

                  <label className="field">
                    <span>Размер</span>
                    <input
                      className="input"
                      type="number"
                      placeholder="200"
                      value={size.amount}
                      onChange={(e) => updateSizeDraft(idx, { amount: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span>Единица</span>
                    <input
                      className="input"
                      placeholder="г, мл, шт"
                      value={size.unit}
                      onChange={(e) => updateSizeDraft(idx, { unit: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span>Цена</span>
                    <input
                      id={`new-product-size-price-${idx}`}
                      className="input"
                      type="number"
                      placeholder="250"
                      value={size.price}
                      aria-invalid={formErrors[`size-${idx}-price`] ? "true" : "false"}
                      onChange={(e) => {
                        clearFieldError(`size-${idx}-price`);
                        clearFieldError("sizes");
                        updateSizeDraft(idx, { price: e.target.value });
                      }}
                    />
                    {formErrors[`size-${idx}-price`] ? (
                      <p className="field-note field-note--error">{formErrors[`size-${idx}-price`]}</p>
                    ) : null}
                  </label>
                </div>

                <div className="menu-size-row__actions">
                  {newProduct.sizes.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        onNewProductChange(
                          "sizes",
                          newProduct.sizes.filter((_, index) => index !== idx)
                        )
                      }
                    >
                      Удалить
                    </button>
                  ) : null}

                  {idx === newProduct.sizes.length - 1 ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() =>
                        onNewProductChange("sizes", [
                          ...newProduct.sizes,
                          emptySize(),
                        ])
                      }
                    >
                      + Размер
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="eyebrow">Меню</p>
          <h2 className="admin-page__title">Товары, размеры и порядок показа</h2>
          <p className="muted">
            Добавление товара теперь открывается в отдельном окне, чтобы основная страница меню оставалась чище.
          </p>
        </div>
      </div>

      <div className="menu-form__launcher-row">
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          Добавить товар
        </button>
      </div>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal admin-modal menu-form-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal__close" onClick={closeCreateModal} disabled={saving}>
              ×
            </button>

            <div className="panel menu-form menu-form--modal">
              <div className="panel__header">
                <div>
                  <h3>Новый товар</h3>
                  <p className="muted">Заполните шаги по порядку и сохраните товар на последнем экране.</p>
                </div>
              </div>

              <div className="form-feedback">
                {Object.keys(formErrors).length > 0 ? (
                  <div className="alert alert--error form-feedback__summary">
                    Проверьте обязательные поля перед добавлением товара.
                  </div>
                ) : null}

                <div className="menu-form__steps" role="tablist" aria-label="Шаги добавления товара">
                  {formSteps.map((step, index) => {
                    const stepState = getStepState(step.key);
                    return (
                      <button
                        key={step.key}
                        type="button"
                        className={
                          "menu-form__step" +
                          (stepState === "active" ? " menu-form__step--active" : "") +
                          (stepState === "error" ? " menu-form__step--error" : "")
                        }
                        onClick={() => setActiveStep(step.key)}
                      >
                        <span className="menu-form__step-index">{index + 1}</span>
                        <span className="menu-form__step-copy">
                          <span className="menu-form__step-label">{step.label}</span>
                          <span className="menu-form__step-helper">{step.helper}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {renderFormStep()}

                <div className="menu-form__nav">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={goToPrevStep}
                    disabled={activeStepIndex === 0 || saving}
                  >
                    Назад
                  </button>

                  <div className="menu-form__nav-spacer" />

                  {activeStep !== "pricing" ? (
                    <button type="button" className="btn btn--primary" onClick={goToNextStep} disabled={saving}>
                      Далее
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={"btn btn--primary" + (saving ? " btn--loading" : "")}
                      onClick={handleCreateClick}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="btn__spinner" />
                          Добавляем
                        </>
                      ) : (
                        "Добавить товар"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="menu-categories">
        {sortedCategories.map((category) => (
          <div key={category.id} className="menu-category">
            <div className="menu-category__header">
              <div>
                <h3>{category.name}</h3>
              </div>
              <div className="menu-category__meta">
                <span className="chip chip--soft">{category.products.length} позиций</span>
                {reorderingCategoryId === category.id ? (
                  <span className="profile-badge profile-badge--accent">Сохраняем порядок…</span>
                ) : null}
              </div>
            </div>

            {category.products.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(category.id, event)}
              >
                <SortableContext
                  items={category.products.map((product) => product.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="menu-product-list">
                    {category.products.map((product) => (
                      <SortableProductRow
                        key={product.id}
                        product={product}
                        busy={busyProductId === product.id}
                        onToggle={handleToggle}
                        onDelete={openDeleteModal}
                        onEdit={onEdit}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="profile-empty-state">
                <strong>Товаров пока нет</strong>
                <p>Добавьте первую позицию в эту категорию через кнопку выше.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteTarget ? (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal__close" onClick={closeDeleteModal} disabled={deleting}>
              ×
            </button>
            <div className="admin-modal__content">
              <h3 className="admin-modal__title">Удалить товар?</h3>
              <p className="admin-modal__text">
                Товар "{deleteTarget.name}" будет удален из списка и скрыт из меню.
              </p>
              <div className="admin-modal__actions">
                <button
                  type="button"
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
                <button type="button" className="btn btn--outline" onClick={closeDeleteModal} disabled={deleting}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminMenuPage;
