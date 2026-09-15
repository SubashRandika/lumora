import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/cn";

export type LoadingStep = "checking" | "loading" | "ready";

const STEPS: Record<Exclude<LoadingStep, "ready">, { label: string; value: number }> = {
  checking: { label: "Checking your device", value: 0.2 },
  loading: { label: "Lighting the candles", value: 0.65 },
};

/**
 * Covers the canvas while the chamber loads, then fades away. Progress moves
 * in real steps (device check, then 3D loading) rather than a fake timer.
 */
export function ChamberLoading({ step }: { step: LoadingStep }) {
  const ready = step === "ready";
  const current = ready ? { label: "Ready", value: 1 } : STEPS[step];

  return (
    <div
      aria-hidden={ready}
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center bg-ink px-5 text-center transition-opacity duration-700 ease-spell",
        ready && "pointer-events-none opacity-0",
      )}
    >
      {/* The entrance animation lives on an inner wrapper: its fill mode would otherwise pin the outer opacity at 1. */}
      <div className="flex animate-emerge flex-col items-center">
        <span aria-hidden="true" className="animate-ember-pulse text-gold">
          ✦
        </span>
        <p className="my-5 font-display text-title text-parchment">
          Preparing the Chamber
        </p>
        <span aria-hidden="true" className="animate-ember-pulse text-gold">
          ✦
        </span>
        <div className="mt-10 w-56">
          <Progress label="Preparing the chamber" value={current.value} />
          <p role="status" className="mt-3 text-sm text-vellum">
            {current.label}
          </p>
        </div>
      </div>
    </div>
  );
}
