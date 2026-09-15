"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function NavLink({ href, children }: { href: Route; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex min-h-11 items-center text-xs font-medium tracking-[0.18em] uppercase transition-colors duration-300 ease-spell",
        active ? "text-wandlight" : "text-vellum hover:text-parchment",
      )}
    >
      {children}
    </Link>
  );
}
