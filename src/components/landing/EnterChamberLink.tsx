"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { MouseEvent, ReactNode } from "react";
import { buttonStyles } from "@/components/ui/Button";
import { useWandlight } from "./WandlightHero";

/**
 * A real link to the chamber. A plain click plays the light-flare transition
 * first. Modified clicks (new tab, etc.) and no-JS visits behave like any link.
 */
export function EnterChamberLink({
  href,
  children,
}: {
  href: Route;
  children: ReactNode;
}) {
  const { enter } = useWandlight();
  const router = useRouter();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.button !== 0 || modified || event.defaultPrevented) return;
    event.preventDefault();
    enter(href);
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      onPointerEnter={() => router.prefetch(href)}
      className={buttonStyles({ size: "lg" })}
    >
      {children}
    </Link>
  );
}
