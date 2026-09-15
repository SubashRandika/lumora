import Link, { type LinkProps } from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "sigil" | "quiet";
type ButtonSize = "md" | "lg";

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap font-body font-medium uppercase tracking-[0.16em] transition-[color,background-color,border-color,box-shadow] duration-300 ease-spell disabled:pointer-events-none disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  // Hairline gold frame. On hover it warms as if lit from inside.
  sigil:
    "border border-gold/70 bg-ink/40 text-parchment hover:border-gold-bright hover:text-wandlight hover:shadow-[inset_0_0_24px_-6px_var(--color-wandlight),0_0_28px_-12px_var(--color-wandlight)] active:bg-slate",
  quiet:
    "border border-transparent text-vellum underline-offset-[6px] hover:text-parchment hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 text-xs",
  lg: "min-h-13 text-sm",
};

// Quiet buttons have no frame, so side padding would only knock them out of alignment.
const padding: Record<ButtonVariant, Record<ButtonSize, string>> = {
  sigil: { md: "px-5", lg: "px-8" },
  quiet: { md: "px-0", lg: "px-0" },
};

export function buttonStyles({
  variant = "sigil",
  size = "md",
  className,
}: ButtonStyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], padding[variant][size], className);
}

type ButtonProps = ComponentPropsWithoutRef<"button"> &
  Omit<ButtonStyleOptions, "className">;

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

type ButtonLinkProps<Href extends string> = LinkProps<Href> &
  Omit<ComponentPropsWithoutRef<"a">, "href"> &
  Omit<ButtonStyleOptions, "className">;

/** A navigation link styled as a button. Use when the action changes the URL. */
export function ButtonLink<Href extends string>({
  variant,
  size,
  className,
  ...props
}: ButtonLinkProps<Href>) {
  return <Link className={buttonStyles({ variant, size, className })} {...props} />;
}
