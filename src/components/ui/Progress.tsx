import { cn } from "@/lib/cn";

interface ProgressProps {
  label: string;
  /** 0–1, or null when progress can't be measured. */
  value: number | null;
  className?: string;
}

/** A thin line of wandlight. Indeterminate progress pulses instead of filling. */
export function Progress({ label, value, className }: ProgressProps) {
  const determinate = value !== null;
  const percent = determinate ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? percent : undefined}
      className={cn("h-px w-full overflow-hidden bg-parchment/15", className)}
    >
      <div
        className={cn(
          "h-full bg-wandlight shadow-[0_0_8px_var(--color-wandlight)]",
          determinate
            ? "transition-[width] duration-500 ease-spell"
            : "w-full animate-ember-pulse",
        )}
        style={determinate ? { width: `${percent}%` } : undefined}
      />
    </div>
  );
}
