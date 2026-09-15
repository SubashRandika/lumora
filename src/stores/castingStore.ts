import { create } from "zustand";
import {
  transition,
  type CastEvent,
  type CastFailureReason,
  type SpellCastState,
} from "@/domain/casting/castMachine";
import type { CastingInput } from "@/domain/casting/engine.types";

/**
 * UI-facing casting state. Holds ids and enums only; never Three.js objects.
 * In the chamber the Spell Engine is the writer (via `syncFromEngine`). UI reads with
 * narrow selectors so a phase change re-renders just the controls that care.
 */
export interface CastingState {
  selectedSpellId: string | null;
  castingState: SpellCastState;
  lastInput: CastingInput | null;
  failureReason: CastFailureReason | null;
}

interface CastingActions {
  selectSpell: (id: string) => void;
  /** Mirrors the Spell Engine, which owns the real lifecycle during a cast. */
  syncFromEngine: (update: {
    castingState: SpellCastState;
    spellId: string | null;
    failureReason?: CastFailureReason | null;
    input?: CastingInput;
  }) => void;
  startCasting: (input: CastingInput) => void;
  advanceCasting: () => void;
  failCasting: (reason: CastFailureReason) => void;
  cancelCasting: () => void;
  resetCasting: () => void;
}

export type CastingStore = CastingState & CastingActions;

export const INITIAL_CASTING_STATE: CastingState = {
  selectedSpellId: null,
  castingState: "idle",
  lastInput: null,
  failureReason: null,
};

export const useCastingStore = create<CastingStore>()((set, get) => {
  const dispatch = (event: CastEvent) => {
    const current = get().castingState;
    const next = transition(current, event);
    if (next !== current) set({ castingState: next });
    return next !== current;
  };

  return {
    ...INITIAL_CASTING_STATE,
    selectSpell: (id) => {
      // Switching spells mid-cast would desync the scene; finish or cancel first.
      if (dispatch({ type: "RESET" }) || get().castingState === "idle") {
        set({ selectedSpellId: id, failureReason: null });
      }
    },
    syncFromEngine: ({ castingState, spellId, failureReason, input }) => {
      set((current) => ({
        castingState,
        selectedSpellId: spellId ?? current.selectedSpellId,
        failureReason:
          failureReason !== undefined
            ? failureReason
            : castingState === "preparing"
              ? null
              : current.failureReason,
        lastInput: input ?? current.lastInput,
      }));
    },
    startCasting: (input) => {
      if (!get().selectedSpellId) return;
      if (dispatch({ type: "CAST" })) set({ lastInput: input, failureReason: null });
    },
    advanceCasting: () => {
      dispatch({ type: "ADVANCE" });
    },
    failCasting: (reason) => {
      if (dispatch({ type: "FAIL", reason })) set({ failureReason: reason });
    },
    cancelCasting: () => {
      dispatch({ type: "CANCEL" });
    },
    resetCasting: () => {
      if (dispatch({ type: "RESET" })) set({ failureReason: null });
    },
  };
});
