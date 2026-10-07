/**
 * Voice casting settings. The matcher itself is pure and lives in
 * src/domain/voice; these are the numbers the chamber tunes it with.
 */
export const VOICE = {
  /**
   * Lowest match score that still casts, 0–1. At 0.75 a word can be badly
   * mangled and still land, while ordinary conversation never does.
   */
  matchThreshold: 0.75,
  /** Give up and close the microphone after this long without a usable result. */
  listenTimeoutMs: 8000,
  /** How long a near miss stays on screen before the prompt returns. */
  missMessageMs: 5000,
  /** Recognition language. The incantations are invented Latin either way. */
  language: "en-GB",
  /** Alternatives to ask for: each is another chance at an awkward word. */
  maxAlternatives: 5,
  /**
   * Pause between hearing a spell that isn't on screen and casting it, so the
   * chamber can swap the target, warm its shaders, and turn the wand to it.
   */
  switchDelayMs: 450,
} as const;
