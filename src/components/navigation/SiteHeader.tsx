import Link from "next/link";
import { site } from "@/config/site";
import { NavLink } from "./NavLink";

import { cn } from "@/lib/cn";

/** `overlay` floats the header over a full-bleed hero instead of taking up space. */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={cn(
        "z-30 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-4 sm:px-8",
        overlay ? "absolute inset-x-0 top-0" : "relative",
      )}
    >
      <Link href="/" className="group inline-flex min-h-11 items-center gap-3">
        <span
          aria-hidden="true"
          className="text-gold transition-colors duration-500 group-hover:text-wandlight"
        >
          ✦
        </span>
        <span className="font-display text-xl tracking-wide text-parchment">
          {site.name}
        </span>
      </Link>
      <nav aria-label="Main">
        <ul className="flex items-center gap-6 sm:gap-8">
          <li>
            <NavLink href="/spells">Spells</NavLink>
          </li>
          <li>
            <NavLink href="/about">About</NavLink>
          </li>
          <li>
            <NavLink href="/settings">Settings</NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}
