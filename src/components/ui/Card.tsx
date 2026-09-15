import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardElement = "div" | "article" | "section" | "li";

type CardProps = {
  as?: CardElement;
  interactive?: boolean;
} & HTMLAttributes<HTMLElement>;

/**
 * A raised panel. A faint top highlight suggests candlelight from above.
 * `interactive` adds the hover glow for cards that contain a primary action.
 */
export function Card({
  as: Component = "div",
  interactive = false,
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        "relative rounded-card border border-parchment/10 bg-night shadow-[inset_0_1px_0_0_rgb(233_221_195/0.06)]",
        interactive &&
          "transition-[border-color,box-shadow] duration-500 ease-spell focus-within:border-gold/50 hover:border-gold/50 hover:shadow-[inset_0_1px_0_0_rgb(233_221_195/0.08),0_0_40px_-20px_var(--color-wandlight)]",
        className,
      )}
      {...props}
    />
  );
}
