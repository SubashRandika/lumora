import {
  SPELL_CATEGORIES,
  SPELL_CATEGORY_IDS,
  type SpellCategoryId,
} from "@/config/categories";
import type { SpellDefinition, SpellDifficulty } from "./spell.schema";

/*
 * Spell library search and filtering. Pure, so the same logic serves the
 * library UI today and the chamber's spell picker (and voice matching) later.
 *
 * URL format (every key optional, repeatable keys for multi-select):
 *   /spells?q=lock&category=charms&category=curses&difficulty=beginner&medium=film
 */

export const SPELL_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export const SPELL_MEDIA = ["book", "film"] as const;
export type SpellMedium = (typeof SPELL_MEDIA)[number];

export interface SpellQuery {
  q: string;
  categories: SpellCategoryId[];
  difficulties: SpellDifficulty[];
  media: SpellMedium[];
}

export const EMPTY_SPELL_QUERY: SpellQuery = {
  q: "",
  categories: [],
  difficulties: [],
  media: [],
};

const MAX_QUERY_LENGTH = 80;

type ParamSource = Pick<URLSearchParams, "get" | "getAll">;

function pickAll<T extends string>(
  params: ParamSource,
  key: string,
  allowed: readonly T[],
): T[] {
  const seen = new Set<T>();
  for (const value of params.getAll(key)) {
    if ((allowed as readonly string[]).includes(value)) seen.add(value as T);
  }
  // Keep the canonical order so equivalent URLs serialise identically.
  return allowed.filter((value) => seen.has(value));
}

/** Reads a query from URL params. Unknown or malformed values are dropped, never thrown. */
export function parseSpellQuery(params: ParamSource): SpellQuery {
  return {
    q: (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    categories: pickAll(params, "category", SPELL_CATEGORY_IDS),
    difficulties: pickAll(params, "difficulty", SPELL_DIFFICULTIES),
    media: pickAll(params, "medium", SPELL_MEDIA),
  };
}

/** Serialises a query to a search string ("" or "?q=…"), omitting empty values. */
export function serializeSpellQuery(query: SpellQuery): string {
  const params = new URLSearchParams();
  const q = query.q.trim();
  if (q) params.set("q", q);
  for (const id of SPELL_CATEGORY_IDS) {
    if (query.categories.includes(id)) params.append("category", id);
  }
  for (const d of SPELL_DIFFICULTIES) {
    if (query.difficulties.includes(d)) params.append("difficulty", d);
  }
  for (const m of SPELL_MEDIA) {
    if (query.media.includes(m)) params.append("medium", m);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function isEmptyQuery(query: SpellQuery): boolean {
  return (
    query.q.trim() === "" &&
    query.categories.length === 0 &&
    query.difficulties.length === 0 &&
    query.media.length === 0
  );
}

/** Lowercase, accent-free, punctuation turned into spaces: "Leg-Locker" → "leg locker". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Relevance of a spell for a free-text search, or 0 for no match. Every word
 * must match somewhere. Matches in the incantation outrank matches in the name,
 * which outrank the summary, so typing "lumos" puts Lumos Solem first.
 */
export function scoreSpell(spell: SpellDefinition, q: string): number {
  const terms = normalizeSearchText(q).split(" ").filter(Boolean);
  if (terms.length === 0) return 1;

  const fields: Array<[text: string, weight: number]> = [
    [normalizeSearchText(spell.incantation), 8],
    [normalizeSearchText(spell.name), 4],
    [normalizeSearchText(SPELL_CATEGORIES[spell.category].label), 2],
    [normalizeSearchText(spell.summary), 1],
  ];

  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const [text, weight] of fields) {
      const words = text.split(" ");
      if (words.some((word) => word.startsWith(term))) best = Math.max(best, weight * 2);
      else if (text.includes(term)) best = Math.max(best, weight);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

function matchesFilters(spell: SpellDefinition, query: SpellQuery): boolean {
  if (query.categories.length > 0 && !query.categories.includes(spell.category)) {
    return false;
  }
  if (query.difficulties.length > 0 && !query.difficulties.includes(spell.difficulty)) {
    return false;
  }
  if (
    query.media.length > 0 &&
    !spell.appearances.some((appearance) => query.media.includes(appearance.medium))
  ) {
    return false;
  }
  return true;
}

/**
 * Applies filters (AND across groups, OR within a group) and search. Without
 * a search term, the dataset's own order is kept.
 */
export function filterSpells(
  spells: readonly SpellDefinition[],
  query: SpellQuery,
): SpellDefinition[] {
  const scored = spells
    .map((spell, index) => ({ spell, index, score: scoreSpell(spell, query.q) }))
    .filter(({ spell, score }) => score > 0 && matchesFilters(spell, query));

  if (query.q.trim()) scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map(({ spell }) => spell);
}

/** Toggles a value in a multi-select group, returning a new array. */
export function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
