import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Category } from "../types";

interface Props {
  categories: Category[];
  activeId?: number;
  onChange: (id: number) => void;
}

const MORE_BUTTON_WIDTH = 90; // запас под кнопку "Ещё"

export const CategoryTabs: React.FC<Props> = ({ categories, activeId, onChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const maxWidth = containerWidth - MORE_BUTTON_WIDTH;

    const itemsWithWidth: { id: number; width: number }[] = categories.map((cat) => {
      const el = itemRefs.current.get(cat.id);
      return { id: cat.id, width: el ? el.getBoundingClientRect().width : 0 };
    });

    let used = 0;
    const vis: number[] = [];
    const hid: number[] = [];

    for (const item of itemsWithWidth) {
      if (item.width === 0) {
        // ещё не измерено — временно считаем видимым
        vis.push(item.id);
        continue;
      }

      if (used + item.width <= maxWidth || vis.length === 0) {
        vis.push(item.id);
        used += item.width;
      } else {
        hid.push(item.id);
      }
    }

    setVisibleIds(vis);
    setHiddenIds(hid);
  }, [categories]);

  useLayoutEffect(() => {
    recalc();
  }, [categories, recalc]);

  useEffect(() => {
    const handleResize = () => recalc();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recalc]);

  // Закрываем "Ещё" при клике вне
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (!moreRef.current) return;
      if (!moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const visible =
    visibleIds.length === 0 ? categories : categories.filter((c) => visibleIds.includes(c.id));
  const hidden = categories.filter((c) => hiddenIds.includes(c.id));

  return (
    <div className="category-tabs" ref={containerRef}>
      <div className="category-tabs__list">
        {visible.map((cat) => (
          <button
            key={cat.id}
            type="button"
            ref={(el) => {
              itemRefs.current.set(cat.id, el);
            }}
            className={
              "category-tab" + (activeId === cat.id ? " category-tab--active" : "")
            }
            onClick={() => onChange(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {hidden.length > 0 && (
        <div className="category-tabs__more" ref={moreRef}>
          <button
            type="button"
            className="category-tab category-tab--more"
            onClick={() => setMoreOpen((v) => !v)}
          >
            Ещё <span className="category-tab__chevron">▼</span>
          </button>

          {moreOpen && (
            <div className="category-tabs__more-menu">
              {hidden.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={
                    "category-tabs__more-item" +
                    (activeId === cat.id ? " category-tabs__more-item--active" : "")
                  }
                  onClick={() => {
                    onChange(cat.id);
                    setMoreOpen(false);
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
