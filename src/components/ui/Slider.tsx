"use client";

import { useId, type CSSProperties } from "react";

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Human-readable value for display and screen readers, e.g. "70%". */
  formatValue?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onValueChange,
  formatValue = (v) => String(v),
  disabled,
}: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  const display = formatValue(value);

  return (
    <div className="py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-parchment">
          {label}
        </label>
        <output htmlFor={id} className="text-sm text-vellum tabular-nums">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(event) => onValueChange(Number(event.target.value))}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        className="h-11 w-full cursor-pointer appearance-none bg-transparent disabled:opacity-40 [&::-moz-range-progress]:h-px [&::-moz-range-progress]:bg-gold [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-wandlight [&::-moz-range-track]:h-px [&::-moz-range-track]:bg-parchment/25 [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-[linear-gradient(90deg,var(--color-gold)_var(--fill),rgb(233_221_195/0.25)_var(--fill))] [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-wandlight [&::-webkit-slider-thumb]:shadow-[0_0_10px_var(--color-wandlight)]"
      />
    </div>
  );
}
