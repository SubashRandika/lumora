import type { PerformanceTier } from "@/domain/performance/tier";

/**
 * Concrete render budgets per tier. The 3D layer reads ONLY these values,
 * never the tier name, so tuning happens here without touching scene code.
 */
export interface QualityProfile {
  /** Canvas device-pixel-ratio clamp [min, max]. The single biggest perf lever. */
  dpr: readonly [number, number];
  antialias: boolean;
  /** Upper bound across all live particle systems combined. */
  particleBudget: number;
  shadows: "off" | "key-light";
  shadowMapSize: 512 | 1024 | 2048;
  /** Dynamic lights allowed at once, including spell lights. */
  maxDynamicLights: number;
  fog: boolean;
  environmentDetail: "reduced" | "full";
  postprocessing: {
    bloom: boolean;
    vignette: boolean;
  };
  /**
   * Frames per second while nothing moves but the candles and dust (no cast,
   * no pointer input). 0 draws every frame regardless.
   */
  idleFrameRate: number;
}

export const QUALITY_PROFILES: Record<PerformanceTier, QualityProfile> = {
  low: {
    dpr: [1, 1],
    antialias: false,
    particleBudget: 600,
    shadows: "off",
    shadowMapSize: 512,
    maxDynamicLights: 2,
    fog: false,
    environmentDetail: "reduced",
    postprocessing: { bloom: false, vignette: false },
    idleFrameRate: 30,
  },
  medium: {
    dpr: [1, 1.5],
    antialias: true,
    particleBudget: 2500,
    shadows: "key-light",
    shadowMapSize: 1024,
    maxDynamicLights: 3,
    fog: true,
    environmentDetail: "full",
    postprocessing: { bloom: true, vignette: true },
    idleFrameRate: 30,
  },
  high: {
    dpr: [1, 2],
    antialias: true,
    particleBudget: 8000,
    shadows: "key-light",
    shadowMapSize: 2048,
    maxDynamicLights: 4,
    fog: true,
    environmentDetail: "full",
    postprocessing: { bloom: true, vignette: true },
    idleFrameRate: 30,
  },
};

/**
 * Limits the build must stay within, checked by `e2e/budgets.spec.ts`.
 * JavaScript sizes are the gzip (level 6) total of every script a route
 * downloads, in KiB, measured in a production build.
 */
export const BUDGETS = {
  /** Landing, library, and spell pages. Measured 167 KiB in Phase 8. */
  contentJsKb: 185,
  /** A cast page at high quality, including post-processing. Measured 475 KiB in Phase 8. */
  chamberJsKb: 520,
  /** Most draw calls in any frame, idle or casting. */
  drawCalls: { low: 60, medium: 150, high: 150 },
} as const;

/** Sustained FPS below this, for `window` seconds, steps quality down one tier at runtime. */
export const ADAPTIVE_QUALITY = {
  minFps: 45,
  windowSeconds: 3,
} as const;
