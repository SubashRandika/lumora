"use client";

import { useId } from "react";
import { chipStyles } from "./chip";

export interface Choice<Value extends string> {
  value: Value;
  label: string;
  hint?: string;
}

interface ChoiceGroupProps<Value extends string> {
  legend: string;
  description?: string;
  choices: readonly Choice<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}

/** Segmented single choice built on native radios, so arrow keys and forms work for free. */
export function ChoiceGroup<Value extends string>({
  legend,
  description,
  choices,
  value,
  onValueChange,
}: ChoiceGroupProps<Value>) {
  const name = useId();
  const descriptionId = `${name}-description`;

  return (
    <fieldset className="py-3" aria-describedby={description ? descriptionId : undefined}>
      <legend className="text-parchment">{legend}</legend>
      {description && (
        <p id={descriptionId} className="text-sm text-vellum">
          {description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const checked = choice.value === value;
          return (
            <label key={choice.value} className={chipStyles(checked)}>
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => onValueChange(choice.value)}
                className="sr-only"
              />
              {choice.label}
              {choice.hint && <span className="sr-only">. {choice.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
