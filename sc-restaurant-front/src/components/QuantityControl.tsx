import React from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const QuantityControl: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="qty">
      <button
        type="button"
        className="qty__btn"
        aria-label="Уменьшить количество"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onChange(Math.max(1, value - 1));
        }}
      >
        -
      </button>
      <span className="qty__value">{value}</span>
      <button
        type="button"
        className="qty__btn"
        aria-label="Увеличить количество"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
};
