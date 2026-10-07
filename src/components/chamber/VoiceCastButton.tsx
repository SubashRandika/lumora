"use client";

import { cn } from "@/lib/cn";
import type { VoiceProblem } from "@/features/spell-casting/voice/recognizer";
import type { VoiceView } from "./useVoiceCasting";

const PROBLEM_MESSAGES: Record<VoiceProblem, string> = {
  blocked: "Microphone blocked. Allow it in your browser, then try again.",
  "no-speech": "Nothing heard. Press the microphone and say the incantation.",
  "no-microphone": "No microphone found. Cast with the button instead.",
  offline: "Speech recognition is offline. Cast with the button instead.",
  unknown: "Listening stopped. Try again.",
};

/** What the chamber says back while it listens. Empty when it has nothing to say. */
export function voiceMessage(view: VoiceView): string {
  switch (view.status) {
    case "listening":
      return view.heard ? "" : "Listening… say the incantation.";
    case "missed":
      return view.heard
        ? "That isn’t one of the seven. Say it again, a little slower."
        : "That isn’t one of the seven. Try again.";
    case "problem":
      return PROBLEM_MESSAGES[view.problem ?? "unknown"];
    default:
      return "";
  }
}

/** The words the recogniser caught, shown as they land. */
function HeardWords({ view }: { view: VoiceView }) {
  if (!view.heard || view.status === "problem") return null;
  return (
    <p
      aria-hidden="true"
      className={cn(
        "font-display text-lg transition-colors duration-500 ease-spell sm:text-xl",
        view.status === "matched"
          ? "text-gold-bright [text-shadow:0_0_18px_var(--color-wandlight)]"
          : view.status === "missed"
            ? "text-vellum/70 line-through decoration-ember/60"
            : "text-wandlight [text-shadow:0_0_14px_color-mix(in_oklab,var(--color-wandlight)_45%,transparent)]",
      )}
    >
      “{view.heard}”
    </p>
  );
}

interface VoiceCastButtonProps {
  view: VoiceView;
  /** False while the chamber is loading or a spell is already running. */
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Opens the microphone for one incantation. It breathes while it waits and
 * sends rings outward while it listens, so the chamber always shows whether
 * anything is being recorded.
 */
export function VoiceCastButton({ view, enabled, onToggle }: VoiceCastButtonProps) {
  const listening = view.status === "listening";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!enabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Cast by voice: speak the incantation"}
      // The accessible name changes while listening; tests watch this instead.
      data-voice={view.status}
      title={listening ? "Stop listening (V)" : "Speak the incantation (V)"}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full border transition-[color,border-color,box-shadow] duration-300 ease-spell disabled:pointer-events-none disabled:opacity-40",
        listening
          ? "border-wandlight text-wandlight shadow-[0_0_28px_-8px_var(--color-wandlight)]"
          : "border-gold/70 text-parchment hover:border-gold-bright hover:text-wandlight hover:shadow-[0_0_28px_-12px_var(--color-wandlight)]",
      )}
    >
      {/* Idle: one slow breath of candlelight. Listening: rings leaving the wand tip. */}
      {enabled && !listening && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-[voice-breathe_3.4s_ease-in-out_infinite] rounded-full bg-gold/25 blur-md"
        />
      )}
      {listening &&
        [0, 1].map((ring) => (
          <span
            key={ring}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-[voice-ripple_2.2s_ease-out_infinite] rounded-full border border-wandlight/70"
            style={{ animationDelay: `${ring * 1.1}s` }}
          />
        ))}

      <svg viewBox="0 0 24 24" className="relative size-5" aria-hidden="true">
        <path
          d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6v5.4a2.6 2.6 0 0 1-5.2 0V6.1A2.6 2.6 0 0 1 12 3.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M6.6 11a5.4 5.4 0 0 0 10.8 0M12 16.4v4.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** The heard words and whatever the chamber wants to say about them. */
export function VoiceStatus({ view }: { view: VoiceView }) {
  const message = voiceMessage(view);
  if (!message && !view.heard) return null;

  return (
    <div className="flex flex-col items-start gap-0.5 sm:items-end">
      <HeardWords view={view} />
      <p
        role="status"
        className={cn(
          "max-w-xs text-sm sm:text-right",
          view.status === "problem" ? "text-ember" : "text-vellum",
        )}
      >
        {view.status === "matched" ? (
          <span className="sr-only">Heard “{view.heard}”. Casting.</span>
        ) : (
          message
        )}
      </p>
    </div>
  );
}
