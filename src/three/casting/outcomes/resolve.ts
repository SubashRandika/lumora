import type { SpellOutcome } from "@/domain/spells/spell.schema";

export type OutcomeKind = SpellOutcome["kind"];

/**
 * Picks the performer for a spell's outcome. Outcomes without a dedicated
 * performer yet fall back to the generic one, so a new outcome kind in the
 * data never breaks a cast.
 */
export function resolveOutcomePerformer<P>(
  performers: Partial<Record<OutcomeKind, P>>,
  kind: OutcomeKind,
  fallback: P,
): P {
  return performers[kind] ?? fallback;
}
