"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUALITY_PROFILES } from "@/config/performance";
import { VOICE } from "@/config/voice";
import { effectiveTier, type PerformanceTier } from "@/domain/performance/tier";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { useDeviceTier } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isCastPhase } from "@/domain/casting/castMachine";
import { useCastingStore } from "@/stores/castingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ChamberErrorBoundary } from "./ChamberErrorBoundary";
import { ChamberFallback, type ChamberProblem } from "./ChamberFallback";
import { ChamberHud } from "./ChamberHud";
import { ChamberLoading, type LoadingStep } from "./ChamberLoading";
import { useCastingKeys } from "./useCastingKeys";
import { useSpellCasting } from "./useSpellCasting";
import { useVoiceCasting } from "./useVoiceCasting";

// The whole 3D layer (three.js, R3F, drei) lives behind this import.
const MagicChamber = dynamic(() => import("@/three/scene/MagicChamber"), { ssr: false });

/** Ignore frame-rate dips while shaders compile and the scene warms up. */
const DECLINE_GRACE_MS = 4000;
const SHOW_DEV_STATS = process.env.NODE_ENV !== "production";

type DeviceState =
  | { status: "checking" }
  | { status: "unsupported" }
  | { status: "supported"; detected: PerformanceTier };

interface ChamberExperienceProps {
  spells: readonly SpellDefinition[];
  initialSpellId: string;
}

export function ChamberExperience({ spells, initialSpellId }: ChamberExperienceProps) {
  const [spellId, setSpellId] = useState(initialSpellId);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<ChamberProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downgrades, setDowngrades] = useState(0);
  const statsRef = useRef<HTMLOutputElement>(null);
  const readyAt = useRef(0);
  /** A spell heard while a different one was on screen, waiting for the swap. */
  const spokenCast = useRef<string | null>(null);

  const graphics = useSettingsStore((s) => s.graphics);
  const voiceAllowed = useSettingsStore((s) => s.voiceEnabled);
  const reducedMotion = useReducedMotion();
  const selectSpell = useCastingStore((s) => s.selectSpell);

  const spell = spells.find((s) => s.id === spellId) ?? spells[0]!;
  const { engine, view, cast, cancel, reset } = useSpellCasting({
    spells,
    spellId: spell.id,
    reducedMotion,
  });

  const decision = useDeviceTier();
  const device: DeviceState = !decision
    ? { status: "checking" }
    : decision.supported
      ? { status: "supported", detected: decision.tier }
      : { status: "unsupported" };

  useEffect(() => {
    selectSpell(spell.id);
  }, [selectSpell, spell.id]);

  const tier: PerformanceTier =
    device.status === "supported"
      ? effectiveTier(graphics, device.detected, downgrades)
      : "low";
  const quality = QUALITY_PROFILES[tier];

  const handleReady = useCallback(() => {
    readyAt.current = performance.now();
    setReady(true);
  }, []);

  const handleDecline = useCallback(() => {
    if (!readyAt.current || performance.now() - readyAt.current < DECLINE_GRACE_MS)
      return;
    readyAt.current = performance.now(); // give the new tier its own grace period
    setDowngrades((n) => n + 1);
  }, []);

  const handleContextLost = useCallback(() => {
    cancel();
    setProblem("context-lost");
  }, [cancel]);
  const handleCrash = useCallback(() => {
    cancel();
    setProblem("crashed");
  }, [cancel]);

  const retry = useCallback(() => {
    setProblem(null);
    setReady(false);
    readyAt.current = 0;
    setAttempt((n) => n + 1);
  }, []);

  const changeSpell = useCallback(
    (id: string) => {
      if (isCastPhase(engine.getState())) return;
      reset();
      setSpellId(id);
      // Update the address without a Next.js navigation, so the canvas isn't torn down.
      window.history.replaceState(window.history.state, "", `/spells/${id}/cast`);
    },
    [engine, reset],
  );

  const loadingStep: LoadingStep =
    device.status === "checking" ? "checking" : ready ? "ready" : "loading";

  const shownProblem: ChamberProblem | null =
    device.status === "unsupported" ? "unsupported" : problem;
  const canCast = ready && !shownProblem;

  const castSpoken = useCallback(
    (id: string) => {
      if (id === spell.id) {
        cast("voice");
        return;
      }
      // Turn the chamber to that spell's target first; the cast follows below.
      spokenCast.current = id;
      changeSpell(id);
    },
    [cast, changeSpell, spell.id],
  );

  // The target it heard is now on screen: let it settle, then raise the wand.
  useEffect(() => {
    if (spokenCast.current !== spell.id) return;
    spokenCast.current = null;
    const timer = setTimeout(() => cast("voice", spell.id), VOICE.switchDelayMs);
    return () => clearTimeout(timer);
  }, [cast, spell.id]);

  const voice = useVoiceCasting({
    spells,
    enabled: canCast && !isCastPhase(view.state) && voiceAllowed,
    onCastSpell: castSpoken,
  });

  useCastingKeys({
    enabled: canCast,
    onCast: () => cast("keyboard"),
    onCancel: cancel,
    onReset: reset,
    onVoice:
      voice.supported && voiceAllowed && !isCastPhase(view.state)
        ? voice.toggleListening
        : undefined,
  });

  const canvas = useMemo(
    () =>
      device.status === "supported" && !problem ? (
        <ChamberErrorBoundary key={attempt} onError={handleCrash}>
          <MagicChamber
            // A new context is needed when antialiasing or shadows toggle.
            key={`${attempt}-${quality.antialias}-${quality.shadows}`}
            spell={spell}
            quality={quality}
            reducedMotion={reducedMotion}
            engine={engine}
            onReady={handleReady}
            onPerformanceDecline={handleDecline}
            onContextLost={handleContextLost}
            statsRef={statsRef}
          />
        </ChamberErrorBoundary>
      ) : null,
    [
      attempt,
      device.status,
      engine,
      handleContextLost,
      handleCrash,
      handleDecline,
      handleReady,
      problem,
      quality,
      reducedMotion,
      spell,
    ],
  );

  return (
    <section
      aria-label="Spell chamber"
      data-chamber-state={shownProblem ?? (ready ? "ready" : loadingStep)}
      data-quality={tier}
      data-cast-state={view.state}
      className="relative h-svh min-h-136 w-full overflow-hidden bg-ink"
    >
      <div className="absolute inset-0">{canvas}</div>

      {shownProblem ? (
        <ChamberFallback problem={shownProblem} spell={spell} onRetry={retry} />
      ) : (
        <>
          <ChamberHud
            spell={spell}
            spells={spells}
            onSelectSpell={changeSpell}
            cast={view}
            canCast={canCast}
            voice={
              voice.supported && voiceAllowed
                ? {
                    view: voice.view,
                    enabled: canCast && !isCastPhase(view.state),
                    onToggle: voice.toggleListening,
                  }
                : null
            }
            onCast={() => cast("button")}
            onCancel={cancel}
            tier={tier}
            autoQuality={graphics === "auto"}
            statsRef={statsRef}
            showStats={SHOW_DEV_STATS}
          />
          <ChamberLoading step={loadingStep} />
        </>
      )}
    </section>
  );
}
