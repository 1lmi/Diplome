import React from "react";
import type { Category } from "../types";

interface Props {
  categories: Category[];
  activeId?: number;
  onChange: (id: number) => void;
}

export const CategoryTabs: React.FC<Props> = ({
  categories,
  activeId,
  onChange,
}) => {
  return (
    <div className="tabs tabs--scrollable">
      {categories.map((c) => (
        <button
          key={c.id}
          className={
            "tabs__item" + (activeId === c.id ? " tabs__item--active" : "")
          }
          onClick={() => onChange(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
};
