/*
 * Performance tiering. Pure: the browser probe gathers a snapshot, this
 * module decides. That keeps the heuristics unit-testable and tunable.
 */

export type PerformanceTier = "low" | "medium" | "high";
export type GraphicsPreference = PerformanceTier | "auto";

export interface DeviceCapabilities {
  webgl2: boolean;
  /** Unmasked or masked GPU renderer string, when the browser exposes one. */
  renderer: string | null;
  maxTextureSize: number;
  hardwareConcurrency: number;
  /** GiB. Only Chromium exposes this; null elsewhere. */
  deviceMemory: number | null;
  devicePixelRatio: number;
  /** Physical pixels on screen (width × height × dpr²). */
  screenPixels: number;
  /** Touch-first device (phones, most tablets). */
  coarsePointer: boolean;
  saveData: boolean;
}

const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|software|basic render driver|mesa offscreen/i;
const FOUR_K_PIXELS = 3840 * 2160;

export type TierDecision =
  | { supported: false; reason: "no-webgl2" }
  | { supported: true; tier: PerformanceTier; reasons: string[] };

export function detectTier(caps: DeviceCapabilities): TierDecision {
  if (!caps.webgl2) return { supported: false, reason: "no-webgl2" };

  const reasons: string[] = [];
  const lowSignals: string[] = [];

  if (caps.renderer && SOFTWARE_RENDERER.test(caps.renderer)) {
    lowSignals.push("software renderer");
  }
  if (caps.saveData) lowSignals.push("data saver on");
  if (caps.deviceMemory !== null && caps.deviceMemory <= 2)
    lowSignals.push("≤2 GB memory");
  if (caps.hardwareConcurrency <= 2) lowSignals.push("≤2 CPU cores");
  if (caps.maxTextureSize < 4096) lowSignals.push("small max texture size");

  if (lowSignals.length > 0) {
    return { supported: true, tier: "low", reasons: lowSignals };
  }

  const strongCpu = caps.hardwareConcurrency >= 8;
  const enoughMemory = caps.deviceMemory === null || caps.deviceMemory >= 8;
  const bigTextures = caps.maxTextureSize >= 8192;

  if (caps.coarsePointer) {
    reasons.push("touch device capped at medium");
    return {
      supported: true,
      tier: caps.hardwareConcurrency >= 6 ? "medium" : "low",
      reasons,
    };
  }

  if (strongCpu && enoughMemory && bigTextures) {
    // Filling a 4K+ canvas at high quality costs more than the extra detail is worth.
    if (caps.screenPixels > FOUR_K_PIXELS * 1.1) {
      reasons.push("very high resolution display");
      return { supported: true, tier: "medium", reasons };
    }
    reasons.push("capable desktop GPU/CPU");
    return { supported: true, tier: "high", reasons };
  }

  reasons.push("mid-range capabilities");
  return { supported: true, tier: "medium", reasons };
}

const TIER_ORDER: readonly PerformanceTier[] = ["low", "medium", "high"];

/** Moves a tier down by `steps`, never below low. */
export function stepDownTier(tier: PerformanceTier, steps: number): PerformanceTier {
  const index = TIER_ORDER.indexOf(tier) - Math.max(0, Math.floor(steps));
  return TIER_ORDER[Math.max(0, index)] ?? "low";
}

/**
 * The tier the chamber should render at right now. Runtime downgrades (from
 * sustained low frame rate) apply only in auto mode: a quality the user picked
 * by hand is respected even if it runs slowly.
 */
export function effectiveTier(
  preference: GraphicsPreference,
  detected: PerformanceTier,
  runtimeDowngrades: number,
): PerformanceTier {
  if (preference !== "auto") return preference;
  return stepDownTier(detected, runtimeDowngrades);
}

export function resolveTier(
  preference: GraphicsPreference,
  detected: PerformanceTier,
): PerformanceTier {
  return preference === "auto" ? detected : preference;
}
