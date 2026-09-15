import { Button, ButtonLink } from "@/components/ui/Button";
import type { SpellDefinition } from "@/domain/spells/spell.schema";

export type ChamberProblem = "unsupported" | "crashed" | "context-lost";

const COPY: Record<ChamberProblem, { title: string; body: string }> = {
  unsupported: {
    title: "Your device can’t show the 3D chamber",
    body: "The chamber needs WebGL 2, which this browser or device doesn’t provide. Every spell’s details are still available to read.",
  },
  crashed: {
    title: "The chamber stopped working",
    body: "The 3D view ran into an error. Reload the chamber to try again, or read about the spell instead.",
  },
  "context-lost": {
    title: "The chamber lost its graphics connection",
    body: "This can happen when the device runs low on graphics memory or another app takes over the GPU. Reload the chamber to try again. Lower graphics quality in Settings may help.",
  },
};

interface ChamberFallbackProps {
  problem: ChamberProblem;
  spell: SpellDefinition;
  onRetry?: () => void;
}

/** What people see instead of the canvas, with a way forward in every case. */
export function ChamberFallback({ problem, spell, onRetry }: ChamberFallbackProps) {
  const copy = COPY[problem];
  return (
    <div
      role="alert"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink px-5 text-center"
    >
      <span aria-hidden="true" className="text-gold">
        ✦
      </span>
      <h1 className="mt-5 max-w-xl text-title text-parchment">{copy.title}</h1>
      <p className="mt-4 max-w-lg text-vellum">{copy.body}</p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        {onRetry && problem !== "unsupported" && (
          <Button size="lg" onClick={onRetry}>
            Reload the chamber
          </Button>
        )}
        <ButtonLink
          href={`/spells/${spell.id}`}
          size="lg"
          variant={problem === "unsupported" ? "sigil" : "quiet"}
        >
          Read about {spell.incantation}
        </ButtonLink>
      </div>
    </div>
  );
}
