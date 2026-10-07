"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CastFailureReason, SpellCastState } from "@/domain/casting/castMachine";
import type { CastingInput, SpellEngineEvent } from "@/domain/casting/engine.types";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { createAudioPerformer } from "@/features/spell-casting/audio/audioPerformer";
import { effectiveVolume } from "@/features/spell-casting/audio/cues";
import { createSpellAudio } from "@/features/spell-casting/audio/SpellAudio";
import { createSpellEngine } from "@/features/spell-casting/SpellEngine";
import { useCastingStore } from "@/stores/castingStore";
import { useSettingsStore } from "@/stores/settingsStore";

export interface CastView {
  state: SpellCastState;
  phase?: NonNullable<Extract<SpellEngineEvent, { type: "state" }>["phase"]>;
  failureReason: CastFailureReason | null;
}

export const IDLE_VIEW: CastView = { state: "idle", failureReason: null };

/**
 * Owns the Spell Engine and spell audio for the chamber. The 3D layer
 * registers its performers with `engine`; the HUD reads `view` and calls
 * `cast`, `cancel`, and `reset`.
 */
export function useSpellCasting({
  spells,
  spellId,
  reducedMotion,
}: {
  spells: readonly SpellDefinition[];
  spellId: string;
  reducedMotion: boolean;
}) {
  // The spell list is static for a page, so the engine can capture it once.
  const [engine] = useState(() =>
    createSpellEngine({ getSpell: (id) => spells.find((s) => s.id === id) }),
  );
  const [audio] = useState(() => createSpellAudio());
  const [view, setView] = useState<CastView>(IDLE_VIEW);
  const lastInput = useRef<CastingInput>("button");

  const syncFromEngine = useCastingStore((s) => s.syncFromEngine);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const masterVolume = useSettingsStore((s) => s.masterVolume);

  useEffect(() => {
    audio.setVolume(effectiveVolume(soundEnabled, masterVolume));
  }, [audio, soundEnabled, masterVolume]);

  // Opening the audio device takes a moment. Do it on the first press anywhere
  // (usually just before the Cast click lands), not in the cast's first frame.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [audio]);

  useEffect(() => {
    const unregister = engine.registerPerformer(createAudioPerformer(audio));
    const unsubscribe = engine.subscribe((event) => {
      if (event.type === "failed") {
        setView((current) => ({ ...current, failureReason: event.reason }));
        syncFromEngine({
          castingState: "failed",
          spellId: event.spellId,
          failureReason: event.reason,
        });
        return;
      }
      setView((current) => ({
        state: event.state,
        phase: event.phase,
        failureReason: event.state === "failed" ? current.failureReason : null,
      }));
      syncFromEngine({
        castingState: event.state,
        spellId: event.spellId,
        input: event.state === "preparing" ? lastInput.current : undefined,
      });
    });
    return () => {
      unsubscribe();
      unregister();
      engine.cancel();
      audio.dispose();
    };
  }, [audio, engine, syncFromEngine]);

  const cast = useCallback(
    /** `castSpellId` defaults to the spell on screen; voice names the one it heard. */
    (input: CastingInput, castSpellId: string = spellId) => {
      // Called from a click, key press, or spoken phrase, so audio may start now.
      audio.unlock();
      lastInput.current = input;
      void engine.cast({ spellId: castSpellId, input, reducedMotion });
    },
    [audio, engine, spellId, reducedMotion],
  );

  const cancel = useCallback(() => engine.cancel(), [engine]);
  const reset = useCallback(() => engine.reset(), [engine]);

  return { engine, view, cast, cancel, reset };
}
