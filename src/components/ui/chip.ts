import { cn } from "@/lib/cn";

/** Pill-shaped choice styling for a <label> wrapping a visually hidden radio or checkbox. */
export function chipStyles(checked: boolean, className?: string): string {
  return cn(
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-300 ease-spell select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-wandlight",
    checked
      ? "border-gold bg-gold/15 text-wandlight"
      : "border-parchment/15 text-vellum hover:border-parchment/40 hover:text-parchment",
    className,
  );
}
