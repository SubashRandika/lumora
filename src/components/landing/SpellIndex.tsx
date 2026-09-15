import Link from "next/link";
import { SPELL_CATEGORIES } from "@/config/categories";
import type { SpellDefinition } from "@/domain/spells/spell.schema";

/** A typographic contents page of every spell, one row per spell. */
export function SpellIndex({
  spells,
  title,
}: {
  spells: readonly SpellDefinition[];
  title: string;
}) {
  return (
    <section
      aria-labelledby="spell-index"
      className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="spell-index" className="text-title text-parchment">
          {title}
        </h2>
        <Link
          href="/spells"
          className="inline-flex min-h-11 items-center eyebrow hover:text-parchment"
        >
          Open the spell library
        </Link>
      </div>

      <hr className="mt-6 rule-gilt" />

      <ul>
        {spells.map((spell) => (
          <li key={spell.id} className="border-b border-parchment/10 pb-5">
            <Link
              href={`/spells/${spell.id}`}
              className="group grid gap-x-8 gap-y-1 pt-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem] sm:items-baseline"
            >
              <span className="font-display text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-tight text-parchment transition-[color,text-shadow] duration-500 group-hover:text-wandlight group-hover:[text-shadow:0_0_24px_rgb(247_233_184/0.35)] group-focus-visible:text-wandlight">
                {spell.incantation}
              </span>
              <span className="text-vellum italic">{spell.name}</span>
              <span className="eyebrow sm:text-right">
                {SPELL_CATEGORIES[spell.category].label}
              </span>
            </Link>
            {/* Outside the link, so the link's accessible name stays short. */}
            <p className="mt-2 max-w-2xl text-parchment/75">{spell.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
