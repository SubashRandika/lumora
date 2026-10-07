"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VOICE } from "@/config/voice";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { matchIncantation } from "@/domain/voice/incantationMatch";
import {
  createVoiceRecognizer,
  isVoiceCastingSupported,
  type VoiceProblem,
  type VoiceRecognizer,
} from "@/features/spell-casting/voice/recognizer";

export type VoiceStatus =
  /** Waiting to be asked. */
  | "idle"
  /** The microphone is open. */
  | "listening"
  /** A spell was recognised and is being cast. */
  | "matched"
  /** Words came back, but none of them were a spell. */
  | "missed"
  | "problem";

export interface VoiceView {
  status: VoiceStatus;
  /** The words as heard, shown back to the caster. */
  heard: string;
  /** The spell that matched, while `status` is "matched". */
  spellId?: string;
  problem?: VoiceProblem;
}

const IDLE: VoiceView = { status: "idle", heard: "" };

/** Whether this browser can listen can't change while the page is open. */
const subscribeToSupport = () => () => {};

/**
 * Listens for an incantation and casts the spell it matches.
 *
 * One press opens the microphone for a single phrase. Whatever comes back is
 * scored against every spell's incantation; the closest spell at or above
 * `VOICE.matchThreshold` is cast, and anything short of that is shown to the
 * caster so they can hear what the machine heard. The microphone never opens
 * on its own.
 */
export function useVoiceCasting({
  spells,
  enabled,
  onCastSpell,
}: {
  spells: readonly SpellDefinition[];
  /** False while the chamber is loading, mid-cast, or voice casting is off. */
  enabled: boolean;
  onCastSpell: (spellId: string) => void;
}) {
  // False on the server and through hydration: only the browser knows.
  const supported = useSyncExternalStore(
    subscribeToSupport,
    isVoiceCastingSupported,
    () => false,
  );
  const [view, setView] = useState<VoiceView>(IDLE);
  const recognizer = useRef<VoiceRecognizer | null>(null);
  const listening = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef({ spells, onCastSpell });

  useEffect(() => {
    latest.current = { spells, onCastSpell };
  }, [spells, onCastSpell]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);

  const stop = useCallback(() => {
    recognizer.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (listening.current) return;
    clearTimers();

    const voice = createVoiceRecognizer({
      language: VOICE.language,
      maxAlternatives: VOICE.maxAlternatives,
      onEvent: (event) => {
        switch (event.type) {
          case "listening":
            listening.current = true;
            setView({ status: "listening", heard: "" });
            // However long someone dithers, the microphone closes on its own.
            after(VOICE.listenTimeoutMs, () => recognizer.current?.stop());
            break;

          case "heard": {
            const [best = ""] = event.transcripts;
            if (!event.final) {
              setView({ status: "listening", heard: best });
              break;
            }
            const match = matchIncantation(event.transcripts, latest.current.spells);
            if (match && match.score >= VOICE.matchThreshold) {
              setView({ status: "matched", heard: match.heard, spellId: match.spellId });
              latest.current.onCastSpell(match.spellId);
            } else {
              setView({ status: "missed", heard: best || match?.heard || "" });
              after(VOICE.missMessageMs, () => setView(IDLE));
            }
            recognizer.current?.stop();
            break;
          }

          case "problem":
            setView({ status: "problem", heard: "", problem: event.problem });
            after(VOICE.missMessageMs, () => setView(IDLE));
            break;

          case "ended":
            listening.current = false;
            // Nothing was decided while the mic was open: go quiet again.
            setView((current) => (current.status === "listening" ? IDLE : current));
            break;
        }
      },
    });

    if (!voice) return;
    recognizer.current = voice;
    voice.start();
  }, [after, clearTimers]);

  const toggleListening = useCallback(() => {
    if (listening.current) stop();
    else start();
  }, [start, stop]);

  // A cast, a spell switch, or leaving the chamber all close the microphone.
  // Stopping it fires "ended", which puts the view back to idle.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      clearTimers();
      recognizer.current?.dispose();
      recognizer.current = null;
      listening.current = false;
    };
  }, [clearTimers]);

  return { supported, view, toggleListening, listening: view.status === "listening" };
}
