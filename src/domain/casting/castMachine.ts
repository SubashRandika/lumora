import type { CastTimeline } from "@/domain/spells/spell.schema";

/*
 * The cast lifecycle as a pure, table-driven state machine.
 *
 *   idle → preparing → casting → projectile → impact → effect → completed
 *            ╰──────────── FAIL ──────────────╯                  ╰→ failed
 *
 * Pure functions only: the engine drives time, the store holds state,
 * and this module decides which transitions are legal.
 */

export type SpellCastState =
  | "idle"
  | "preparing"
  | "casting"
  | "projectile"
  | "impact"
  | "effect"
  | "completed"
  | "failed";

/** States that have a timed duration in a spell's timeline. */
export type CastPhase = keyof CastTimeline;

export type CastEvent =
  | { type: "CAST" }
  /** The current phase finished; move to the next one. */
  | { type: "ADVANCE" }
  | { type: "FAIL"; reason: CastFailureReason }
  /** User aborted an in-progress cast (e.g. Esc). */
  | { type: "CANCEL" }
  | { type: "RESET" };

export type CastFailureReason =
  "assets-unavailable" | "renderer-lost" | "gesture-not-recognised" | "unknown";

export const CAST_PHASES: readonly CastPhase[] = [
  "preparing",
  "casting",
  "projectile",
  "impact",
  "effect",
];

const NEXT_PHASE: Record<CastPhase, SpellCastState> = {
  preparing: "casting",
  casting: "projectile",
  projectile: "impact",
  impact: "effect",
  effect: "completed",
};

export function isCastPhase(state: SpellCastState): state is CastPhase {
  return (CAST_PHASES as readonly string[]).includes(state);
}

export function isCastInProgress(state: SpellCastState): boolean {
  return isCastPhase(state);
}

/**
 * Returns the next state, or the same state when the event is not legal
 * from here. Illegal events are ignored rather than thrown, so a stray
 * double-click or key-repeat can never corrupt a cast.
 */
export function transition(state: SpellCastState, event: CastEvent): SpellCastState {
  switch (event.type) {
    case "CAST":
      return state === "idle" || state === "completed" || state === "failed"
        ? "preparing"
        : state;
    case "ADVANCE":
      return isCastPhase(state) ? NEXT_PHASE[state] : state;
    case "FAIL":
      return isCastPhase(state) ? "failed" : state;
    case "CANCEL":
      return isCastPhase(state) ? "idle" : state;
    case "RESET":
      return state === "completed" || state === "failed" ? "idle" : state;
  }
}

/** Total time from CAST to completed, in seconds. */
export function totalCastDuration(timeline: CastTimeline): number {
  return CAST_PHASES.reduce((sum, phase) => sum + timeline[phase], 0);
}
