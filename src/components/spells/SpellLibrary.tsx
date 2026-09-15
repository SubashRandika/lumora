"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { SPELL_CATEGORIES, SPELL_CATEGORY_IDS } from "@/config/categories";
import { formatDifficulty } from "@/domain/spells/format";
import {
  EMPTY_SPELL_QUERY,
  filterSpells,
  isEmptyQuery,
  parseSpellQuery,
  serializeSpellQuery,
  SPELL_DIFFICULTIES,
  toggleValue,
  type SpellMedium,
  type SpellQuery,
} from "@/domain/spells/query";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup, type CheckboxOption } from "@/components/ui/CheckboxGroup";
import { SpellCard } from "./SpellCard";

const MEDIUM_OPTIONS: readonly CheckboxOption<SpellMedium>[] = [
  { value: "book", label: "Book" },
  { value: "film", label: "Film" },
];

interface SpellLibraryProps {
  spells: readonly SpellDefinition[];
}

/** Interactive library. Reads its initial query from the URL and keeps the URL in sync. */
export function SpellLibrary({ spells }: SpellLibraryProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState<SpellQuery>(() => parseSpellQuery(searchParams));

  useEffect(() => {
    const next = `${pathname}${serializeSpellQuery(query)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      // Replace, not push: typing shouldn't fill the back button with every keystroke.
      window.history.replaceState(window.history.state, "", next);
    }
  }, [pathname, query]);

  return <SpellLibraryView spells={spells} query={query} onQueryChange={setQuery} />;
}

/**
 * The static stand-in rendered on the server (and without JavaScript): every
 * spell, with controls in their default state.
 */
export function SpellLibraryFallback({ spells }: SpellLibraryProps) {
  return (
    <SpellLibraryView
      spells={spells}
      query={EMPTY_SPELL_QUERY}
      onQueryChange={() => {}}
    />
  );
}

function emptyStateMessage(query: SpellQuery): string {
  const q = query.q.trim();
  const hasFilters = !isEmptyQuery({ ...query, q: "" });
  if (q && hasFilters) {
    return `Nothing matches “${q}” with these filters. Remove a filter or search part of a word.`;
  }
  if (q) return `Nothing matches “${q}”. Check the spelling, or search part of a word.`;
  return "No spell fits every filter you’ve chosen. Remove one to see more.";
}

interface SpellLibraryViewProps extends SpellLibraryProps {
  query: SpellQuery;
  onQueryChange: (query: SpellQuery) => void;
}

function SpellLibraryView({ spells, query, onQueryChange }: SpellLibraryViewProps) {
  const searchId = useId();
  const results = useMemo(() => filterSpells(spells, query), [spells, query]);
  const empty = isEmptyQuery(query);

  // Only offer choices that can match something in this content pack.
  const categoryOptions = useMemo(
    () =>
      SPELL_CATEGORY_IDS.filter((id) => spells.some((s) => s.category === id)).map(
        (id) => ({
          value: id,
          label: SPELL_CATEGORIES[id].label,
        }),
      ),
    [spells],
  );
  const difficultyOptions = useMemo(
    () =>
      SPELL_DIFFICULTIES.filter((d) => spells.some((s) => s.difficulty === d)).map(
        (d) => ({
          value: d,
          label: formatDifficulty(d),
        }),
      ),
    [spells],
  );

  const update = (patch: Partial<SpellQuery>) => onQueryChange({ ...query, ...patch });
  const clear = () => onQueryChange(EMPTY_SPELL_QUERY);

  return (
    <div className="mt-12">
      <search aria-label="Spell search and filters">
        <label htmlFor={searchId} className="eyebrow">
          Search spells
        </label>
        <div className="relative mt-3">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gold"
          >
            ✦
          </span>
          <input
            id={searchId}
            type="search"
            value={query.q}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Try “levi”, “lock”, or “fire”"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={80}
            className="h-14 w-full rounded-card border border-parchment/15 bg-night pr-4 pl-11 font-display text-xl text-parchment transition-colors duration-300 placeholder:font-body placeholder:text-base placeholder:text-vellum/70 hover:border-parchment/30 focus:border-gold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-wandlight"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-5">
          <CheckboxGroup
            legend="Category"
            options={categoryOptions}
            values={query.categories}
            onToggle={(id) => update({ categories: toggleValue(query.categories, id) })}
          />
          <CheckboxGroup
            legend="Difficulty"
            options={difficultyOptions}
            values={query.difficulties}
            onToggle={(d) => update({ difficulties: toggleValue(query.difficulties, d) })}
          />
          <CheckboxGroup
            legend="Appears in"
            options={MEDIUM_OPTIONS}
            values={query.media}
            onToggle={(m) => update({ media: toggleValue(query.media, m) })}
          />
        </div>
      </search>

      <div className="mt-10 flex min-h-11 flex-wrap items-center justify-between gap-4 border-t border-parchment/10 pt-6">
        <p role="status" className="text-sm text-vellum">
          {empty
            ? `${spells.length} spells`
            : `Showing ${results.length} of ${spells.length} spells`}
        </p>
        {!empty && (
          <Button variant="quiet" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((spell) => (
            <li key={spell.id} className="flex">
              <SpellCard spell={spell} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-card border border-dashed border-parchment/15 px-6 py-14 text-center">
          <p className="font-display text-title text-parchment">No spells match</p>
          <p className="mx-auto mt-3 max-w-md text-vellum">{emptyStateMessage(query)}</p>
          <Button className="mt-8" onClick={clear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
