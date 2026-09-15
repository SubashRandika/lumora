"use client";

import type { CSSProperties } from "react";
import type { CastFailureReason, CastPhase } from "@/domain/casting/castMachine";
import { isCastPhase } from "@/domain/casting/castMachine";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { Button } from "@/components/ui/Button";
import type { CastView } from "./useSpellCasting";

const PHASE_LABELS: Record<CastPhase, string> = {
  preparing: "Raising the wand",
  casting: "Gathering the magic",
  projectile: "Releasing the spell",
  impact: "The spell strikes",
  effect: "The magic takes hold",
};

const FAILURE_MESSAGES: Record<CastFailureReason, string> = {
  "assets-unavailable": "Part of the spell couldn’t load. Cast again to retry.",
  "renderer-lost": "The chamber lost its graphics connection.",
  "gesture-not-recognised": "The wand motion wasn’t recognised. Try the gesture again.",
  unknown: "Something interrupted the spell. Cast again to retry.",
};

/** What a screen reader hears as the cast progresses. */
export function castAnnouncement(view: CastView, spell: SpellDefinition): string {
  if (isCastPhase(view.state)) return `${PHASE_LABELS[view.state]}…`;
  if (view.state === "completed") return `${spell.incantation}: spell complete.`;
  if (view.state === "failed") {
    return `The spell didn’t take. ${FAILURE_MESSAGES[view.failureReason ?? "unknown"]}`;
  }
  return "";
}

interface CastControlsProps {
  spell: SpellDefinition;
  view: CastView;
  /** False while the chamber is still loading. */
  canCast: boolean;
  onCast: () => void;
  onCancel: () => void;
  onChooseAnother: () => void;
}

/** The cast button and everything that replaces it while a spell runs and after it lands. */
export function CastControls({
  spell,
  view,
  canCast,
  onCast,
  onCancel,
  onChooseAnother,
}: CastControlsProps) {
  const casting = isCastPhase(view.state);

  return (
    <div className="pointer-events-auto flex min-h-24 flex-col items-start gap-2 sm:items-end">
      <p role="status" className="sr-only">
        {castAnnouncement(view, spell)}
      </p>

      {casting && (
        <>
          <p
            aria-hidden="true"
            className="font-display text-lg text-wandlight sm:text-xl"
          >
            {PHASE_LABELS[view.state as CastPhase]}…
          </p>
          <div aria-hidden="true" className="h-px w-56 overflow-hidden bg-parchment/15">
            {view.phase && (
              <div
                key={view.state}
                className="h-full origin-left bg-wandlight shadow-[0_0_8px_var(--color-wandlight)]"
                style={
                  {
                    "--from": view.phase.startFraction,
                    "--to": view.phase.endFraction,
                    transform: `scaleX(${view.phase.endFraction})`,
                    animation: `cast-progress ${Math.max(0.01, view.phase.duration)}s linear both`,
                  } as CSSProperties
                }
              />
            )}
          </div>
          <Button variant="quiet" onClick={onCancel}>
            Cancel <span className="text-vellum/70 normal-case">(Esc)</span>
          </Button>
        </>
      )}

      {view.state === "completed" && (
        <>
          <p className="font-display text-lg text-gold-bright sm:text-xl">
            Spell complete
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:justify-end">
            <Button onClick={onCast} className="sm:min-h-13 sm:px-8 sm:text-sm">
              Cast again
            </Button>
            <Button variant="quiet" onClick={onChooseAnother}>
              Choose another spell
            </Button>
          </div>
        </>
      )}

      {view.state === "failed" && (
        <>
          <p className="font-display text-lg text-ember sm:text-xl">
            The spell didn’t take
          </p>
          <p className="max-w-xs text-sm text-vellum sm:text-right">
            {FAILURE_MESSAGES[view.failureReason ?? "unknown"]}
          </p>
          <Button onClick={onCast} className="sm:min-h-13 sm:px-8 sm:text-sm">
            Cast again
          </Button>
        </>
      )}

      {view.state === "idle" && (
        <>
          <Button
            onClick={onCast}
            disabled={!canCast}
            aria-describedby="cast-hint"
            className="sm:min-h-13 sm:px-8 sm:text-sm"
          >
            Cast {spell.incantation}
          </Button>
          <p id="cast-hint" className="text-xs text-vellum sm:text-sm">
            {canCast ? "Or press Space to cast." : "The chamber is still loading."}
          </p>
        </>
      )}
    </div>
  );
}
