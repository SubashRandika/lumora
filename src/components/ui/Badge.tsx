import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "gold" | "muted";

const tones: Record<BadgeTone, string> = {
  gold: "border-gold/40 text-gold-bright",
  muted: "border-parchment/15 text-vellum",
};

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
