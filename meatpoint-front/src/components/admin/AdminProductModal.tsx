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

const AdminProductModal: React.FC<Props> = ({ product, onClose, onSave, saving }) => {
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

  return (
    <div
      className="modal-backdrop"
      data-leave={closing ? "true" : undefined}
      onClick={handleClose}
    >
      <div
        className="modal modal--wide"
        data-leave={closing ? "true" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={handleClose}>
          ×
        </button>
        <div className="modal__content admin-edit-modal">
          <div className="modal__image-wrap">
            {imagePreview && <img className="modal__image" src={imagePreview} alt={product.name} />}
            <input
              className="input input--file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || undefined)}
            />
          </div>
          <div className="modal__info">
            <h2 className="modal__title">Редактирование товара</h2>
            <p className="modal__subtitle">Полное управление карточкой и вариантами размеров</p>

            <div className="stack gap-6">
              <div className="grid grid-2 gap-8">
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название"
                />
                <input
                  className="input"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  type="number"
                  placeholder="Порядок"
                />
              </div>
              <textarea
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание"
              />
              <div className="field-inline">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!isActive}
                    onChange={(e) => setIsActive(!e.target.checked)}
                  />
                  <span>Отключить товар</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={isHidden}
                    onChange={(e) => setIsHidden(e.target.checked)}
                  />
                  <span>Скрыть из меню</span>
                </label>
              </div>

              <div className="panel__subhead">КБЖУ (на 100 г)</div>
              <div className="grid grid-4 gap-6 muted-inputs">
                <input
                  className="input input--sm"
                  type="number"
                  placeholder="Ккал"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
                <input
                  className="input input--sm"
                  type="number"
                  placeholder="Белки"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
                <input
                  className="input input--sm"
                  type="number"
                  placeholder="Жиры"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
                <input
                  className="input input--sm"
                  type="number"
                  placeholder="Углеводы"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </div>

              <div className="panel__subhead">Варианты и цены</div>
              <div className="stack gap-4">
                {sizes.map((s, idx) => (
                  <div key={s.id || idx} className="admin-size-row">
                    <div className="grid grid-5 gap-6 align-center">
                      <input
                        className="input input--sm"
                        placeholder="Название"
                        value={s.name}
                        onChange={(e) => {
                          const next = [...sizes];
                          next[idx] = { ...s, name: e.target.value };
                          setSizes(next);
                        }}
                      />
                      <input
                        className="input input--sm"
                        type="number"
                        placeholder="Размер"
                        value={s.amount}
                        onChange={(e) => {
                          const next = [...sizes];
                          next[idx] = { ...s, amount: e.target.value };
                          setSizes(next);
                        }}
                      />
                      <input
                        className="input input--sm"
                        placeholder="Единицы (грамм, мл)"
                        value={s.unit}
                        onChange={(e) => {
                          const next = [...sizes];
                          next[idx] = { ...s, unit: e.target.value };
                          setSizes(next);
                        }}
                      />
                      <input
                        className="input input--sm"
                        type="number"
                        placeholder="Цена"
                        value={s.price}
                        onChange={(e) => {
                          const next = [...sizes];
                          next[idx] = { ...s, price: e.target.value };
                          setSizes(next);
                        }}
                      />
                      <div className="field-inline field-inline--right">
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={!!s.is_hidden}
                            onChange={(e) => {
                              const next = [...sizes];
                              next[idx] = { ...s, is_hidden: e.target.checked };
                              setSizes(next);
                            }}
                          />
                          <span>Скрыт</span>
                        </label>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleRemoveSize(idx)}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn--outline btn--sm"
                  onClick={() =>
                    setSizes((prev) => [...prev, { name: "", amount: "", unit: "", price: "" }])
                  }
                >
                  + Добавить размер
                </button>
              </div>

              <div className="panel__actions">
                <button className="btn btn--ghost" onClick={handleClose}>
                  Закрыть
                </button>
                <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                  Сохранить изменения
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProductModal;
