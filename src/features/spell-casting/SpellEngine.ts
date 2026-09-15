import {
  CAST_PHASES,
  totalCastDuration,
  transition,
  type CastEvent,
  type CastFailureReason,
  type CastPhase,
  type SpellCastState,
} from "@/domain/casting/castMachine";
import type {
  CastRequest,
  PhaseCue,
  SpellEngine,
  SpellEngineEvent,
  SpellPerformer,
} from "@/domain/casting/engine.types";
import type { SpellDefinition } from "@/domain/spells/spell.schema";

export interface SpellEngineOptions {
  getSpell: (id: string) => SpellDefinition | undefined;
  /** Read at the start of every cast, so a Settings change applies to the next cast. */
  getReducedMotion?: () => boolean;
  /** Injected for tests. Resolves after `ms`, or rejects when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /**
   * A performer that hasn't settled this long after its phase's planned end
   * is abandoned, so one stuck animation can't freeze a cast.
   */
  performerGraceMs?: number;
}

type PhaseInfo = NonNullable<Extract<SpellEngineEvent, { type: "state" }>["phase"]>;

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Where each phase starts and ends as a fraction of the whole cast, for progress UI. */
export function phaseInfo(spell: SpellDefinition, phase: CastPhase): PhaseInfo {
  const total = totalCastDuration(spell.timeline) || 1;
  const index = CAST_PHASES.indexOf(phase);
  const before = CAST_PHASES.slice(0, index).reduce(
    (sum, p) => sum + spell.timeline[p],
    0,
  );
  const duration = spell.timeline[phase];
  return {
    duration,
    startFraction: before / total,
    endFraction: (before + duration) / total,
  };
}

/**
 * The conductor of every cast. It owns the state machine and the clock, cues
 * performers at each phase, and advances only when both the planned duration
 * has passed and every performer has settled. It knows nothing about
 * rendering or sound.
 */
export function createSpellEngine(options: SpellEngineOptions): SpellEngine {
  const sleep = options.sleep ?? abortableSleep;
  const graceMs = options.performerGraceMs ?? 3000;
  const performers = new Set<SpellPerformer>();
  const listeners = new Set<(event: SpellEngineEvent) => void>();

  let state: SpellCastState = "idle";
  let spellId: string | null = null;
  let controller: AbortController | null = null;
  let disposed = false;

  const emit = (event: SpellEngineEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  const dispatch = (event: CastEvent, phase?: PhaseInfo) => {
    const next = transition(state, event);
    if (next === state) return false;
    state = next;
    emit({ type: "state", state, spellId, phase });
    return true;
  };

  const resetPerformers = () => {
    for (const performer of performers) {
      try {
        performer.reset();
      } catch {
        // One performer failing to reset must not leave the others mid-animation.
      }
    }
  };

  const stop = () => {
    controller?.abort();
    controller = null;
    resetPerformers();
  };

  const fail = (reason: CastFailureReason) => {
    stop();
    if (dispatch({ type: "FAIL", reason }) && spellId) {
      emit({ type: "failed", spellId, reason });
    }
  };

  /** One performer's work for a phase, abandoned if it overruns the phase plus a grace period. */
  const runPerformer = (performer: SpellPerformer, cue: PhaseCue) =>
    Promise.race([
      Promise.resolve().then(() => performer.perform(cue)),
      sleep(cue.duration * 1000 + graceMs, cue.signal).catch(() => undefined),
    ]);

  return {
    async cast({ spellId: requestedId, reducedMotion: requestedMotion }: CastRequest) {
      const spell = options.getSpell(requestedId);
      if (disposed || !spell || controller) return state;

      const own = new AbortController();
      const { signal } = own;
      const reducedMotion = requestedMotion ?? options.getReducedMotion?.() ?? false;

      spellId = spell.id;
      resetPerformers();
      if (!dispatch({ type: "CAST" }, phaseInfo(spell, "preparing"))) return state;
      controller = own;

      try {
        await Promise.all([...performers].map((p) => p.preload?.(spell, signal)));
      } catch {
        if (!signal.aborted) fail("assets-unavailable");
        return state;
      }

      for (const [index, phase] of CAST_PHASES.entries()) {
        if (signal.aborted) return state;
        const cue: PhaseCue = {
          spell,
          phase,
          duration: spell.timeline[phase],
          reducedMotion,
          signal,
        };

        try {
          await Promise.all([
            sleep(cue.duration * 1000, signal),
            ...[...performers].map((performer) => runPerformer(performer, cue)),
          ]);
        } catch {
          if (!signal.aborted) fail("unknown");
          return state;
        }

        if (signal.aborted) return state;
        const next = CAST_PHASES[index + 1];
        dispatch({ type: "ADVANCE" }, next ? phaseInfo(spell, next) : undefined);
      }

      if (controller === own) controller = null;
      return state;
    },

    cancel() {
      if (!controller) return;
      stop();
      dispatch({ type: "CANCEL" });
    },

    reset() {
      if (controller) return;
      resetPerformers();
      dispatch({ type: "RESET" });
    },

    registerPerformer(performer) {
      performers.add(performer);
      return () => {
        performers.delete(performer);
        try {
          performer.reset();
        } catch {
          // An unmounting performer may already have lost its scene objects.
        }
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getState: () => state,

    dispose() {
      disposed = true;
      stop();
      performers.clear();
      listeners.clear();
    },
  };
}
