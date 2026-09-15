"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch with its label. The whole row is the hit target. */
export function Toggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: ToggleProps) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="group flex w-full items-center justify-between gap-6 py-3 text-left disabled:opacity-40"
    >
      <span>
        <span className="block text-parchment">{label}</span>
        {description && (
          <span id={descriptionId} className="block text-sm text-vellum">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-spell",
          checked ? "border-gold bg-gold/25" : "border-parchment/25 bg-ink",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 left-0.5 size-4 -translate-y-1/2 rounded-full transition-[translate,background-color,box-shadow] duration-300 ease-spell",
            checked
              ? "translate-x-5 bg-wandlight shadow-[0_0_12px_var(--color-wandlight)]"
              : "bg-vellum",
          )}
        />
      </span>
    </button>
  );
}
