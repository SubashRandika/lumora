"use client";

import { chipStyles } from "./chip";

export interface CheckboxOption<Value extends string> {
  value: Value;
  label: string;
}

interface CheckboxGroupProps<Value extends string> {
  legend: string;
  options: readonly CheckboxOption<Value>[];
  values: readonly Value[];
  onToggle: (value: Value) => void;
  className?: string;
}

/** Multi-select chips built on native checkboxes. Nothing selected means "any". */
export function CheckboxGroup<Value extends string>({
  legend,
  options,
  values,
  onToggle,
  className,
}: CheckboxGroupProps<Value>) {
  return (
    <fieldset className={className}>
      <legend className="mb-3 eyebrow">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label key={option.value} className={chipStyles(checked)}>
              <input
                type="checkbox"
                value={option.value}
                checked={checked}
                onChange={() => onToggle(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={checked ? "text-wandlight" : "text-parchment/25"}
              >
                ✦
              </span>
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
