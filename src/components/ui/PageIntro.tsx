import type { ReactNode } from "react";

/** The opening block of an inner page: eyebrow, title, and a short lede. */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-3 text-display text-parchment">{title}</h1>
      {children && <div className="mt-5 text-lg text-vellum">{children}</div>}
    </div>
  );
}
