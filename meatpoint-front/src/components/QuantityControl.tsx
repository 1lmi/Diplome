import React from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export const QuantityControl: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="qty">
      <button
        type="button"
        className="qty__btn"
        aria-label="Уменьшить количество"
        onClick={(e) => {
          e.stopPropagation();
          onChange(Math.max(1, value - 1));
        }}
      >
        –
      </button>
      <span className="qty__value">{value}</span>
      <button
        type="button"
        className="qty__btn"
        aria-label="Увеличить количество"
        onClick={(e) => {
          e.stopPropagation();
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
};
