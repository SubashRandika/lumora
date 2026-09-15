import gsap from "gsap";

/** Maps spell-data easing names to GSAP eases. */
export const EASES = {
  linear: "none",
  "ease-in": "power2.in",
  "ease-out": "power2.out",
  "ease-in-out": "sine.inOut",
  snap: "power4.out",
} as const;

/**
 * Plays a timeline to the end and resolves, or kills it and resolves early
 * if the cast is cancelled. Never rejects: a cancelled animation isn't an error.
 */
export function playTimeline(
  timeline: gsap.core.Timeline,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      timeline.kill();
      return resolve();
    }
    const onAbort = () => {
      timeline.kill();
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timeline.eventCallback("onComplete", () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
    timeline.play(0);
  });
}

export { gsap };
