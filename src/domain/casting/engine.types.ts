import type { SpellDefinition } from "@/domain/spells/spell.schema";
import type { CastFailureReason, CastPhase, SpellCastState } from "./castMachine";

/*
 * Spell Engine contract. Implemented in src/features/spell-casting/SpellEngine.ts.
 *
 * The engine is a conductor. It owns the state machine and the clock, and
 * delegates every sensory concern to "performers" registered by outer layers:
 *
 *   input sources ──cast()──▶ SpellEngine ──phase cues──▶ performers
 *   (button, key,              (state machine,            (wand, projectile,
 *    gesture, voice)            timing, cancel)            target, camera,
 *                                                          environment, audio)
 *
 * The engine never imports Three.js, React, or audio APIs. That keeps it
 * unit-testable and lets new inputs (voice, camera) or new renderers (AR)
 * plug in without touching spell logic.
 */

export type CastingInput =
  "button" | "keyboard" | "mouse-gesture" | "touch-gesture" | "voice" | "camera";

export interface CastRequest {
  spellId: string;
  input: CastingInput;
  /** The caller's current motion preference. Falls back to the engine's `getReducedMotion`. */
  reducedMotion?: boolean;
}

/** What a performer receives at the start of each phase. */
export interface PhaseCue {
  spell: SpellDefinition;
  phase: CastPhase;
  /** Planned phase duration in seconds, already scaled for reduced motion. */
  duration: number;
  reducedMotion: boolean;
  /** Aborted when the cast is cancelled or fails; performers must stop promptly. */
  signal: AbortSignal;
}

/**
 * A performer renders one aspect of a cast (wand, camera, audio...).
 * The engine waits for all performers AND the planned duration before
 * advancing, so a slow asset never desynchronises the sequence and a fast
 * performer never cuts a phase short.
 */
export interface SpellPerformer {
  readonly id: string;
  /** Load/cache anything this spell needs. Called before `preparing` starts. */
  preload?(spell: SpellDefinition, signal: AbortSignal): Promise<void>;
  perform(cue: PhaseCue): Promise<void> | void;
  /** Return to rest immediately (cancel, reset, unmount). Must be idempotent. */
  reset(): void;
}

export type SpellEngineEvent =
  | {
      type: "state";
      state: SpellCastState;
      spellId: string | null;
      /** Present while a timed phase runs: how long it lasts and how far through the cast it ends. */
      phase?: { duration: number; startFraction: number; endFraction: number };
    }
  | { type: "failed"; spellId: string; reason: CastFailureReason };

export interface SpellEngine {
  /** Starts a cast. Resolves when it completes, fails, or is cancelled. */
  cast(request: CastRequest): Promise<SpellCastState>;
  /** Stops an in-progress cast and returns to idle. */
  cancel(): void;
  /** Returns from completed or failed to idle, putting every performer at rest. */
  reset(): void;
  registerPerformer(performer: SpellPerformer): () => void;
  subscribe(listener: (event: SpellEngineEvent) => void): () => void;
  getState(): SpellCastState;
  dispose(): void;
}
