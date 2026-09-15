import { describe, expect, it } from "vitest";
import {
  detectTier,
  effectiveTier,
  resolveTier,
  stepDownTier,
  type DeviceCapabilities,
} from "./tier";

const desktop: DeviceCapabilities = {
  webgl2: true,
  renderer: "ANGLE (NVIDIA GeForce RTX 3070)",
  maxTextureSize: 16384,
  hardwareConcurrency: 12,
  deviceMemory: 8,
  devicePixelRatio: 1,
  screenPixels: 2560 * 1440,
  coarsePointer: false,
  saveData: false,
};

const tierOf = (overrides: Partial<DeviceCapabilities>) => {
  const decision = detectTier({ ...desktop, ...overrides });
  return decision.supported ? decision.tier : "unsupported";
};

describe("detectTier", () => {
  it("reports unsupported without WebGL2", () => {
    expect(detectTier({ ...desktop, webgl2: false })).toEqual({
      supported: false,
      reason: "no-webgl2",
    });
  });

  it("gives capable desktops the high tier", () => {
    expect(tierOf({})).toBe("high");
  });

  it("treats unknown device memory (Firefox/Safari) as not limiting", () => {
    expect(tierOf({ deviceMemory: null })).toBe("high");
  });

  it.each<[string, Partial<DeviceCapabilities>]>([
    ["software rendering", { renderer: "Google SwiftShader" }],
    ["data saver", { saveData: true }],
    ["2 GB memory", { deviceMemory: 2 }],
    ["dual core", { hardwareConcurrency: 2 }],
    ["tiny textures", { maxTextureSize: 2048 }],
  ])("drops to low for %s", (_, overrides) => {
    expect(tierOf(overrides)).toBe("low");
  });

  it("caps touch devices at medium, low for weaker ones", () => {
    expect(tierOf({ coarsePointer: true, hardwareConcurrency: 8 })).toBe("medium");
    expect(tierOf({ coarsePointer: true, hardwareConcurrency: 4 })).toBe("low");
  });

  it("uses medium for mid-range laptops", () => {
    expect(tierOf({ hardwareConcurrency: 4, maxTextureSize: 8192 })).toBe("medium");
  });

  it("steps down on very high resolution displays", () => {
    expect(tierOf({ screenPixels: 5120 * 2880 })).toBe("medium");
  });
});

describe("stepDownTier / effectiveTier", () => {
  it("steps down and stops at low", () => {
    expect(stepDownTier("high", 1)).toBe("medium");
    expect(stepDownTier("high", 5)).toBe("low");
    expect(stepDownTier("medium", 0)).toBe("medium");
    expect(stepDownTier("medium", -2)).toBe("medium");
  });

  it("applies runtime downgrades only in auto mode", () => {
    expect(effectiveTier("auto", "high", 1)).toBe("medium");
    expect(effectiveTier("high", "high", 2)).toBe("high");
    expect(effectiveTier("low", "high", 0)).toBe("low");
  });
});

describe("resolveTier", () => {
  it("honours manual preference over detection", () => {
    expect(resolveTier("low", "high")).toBe("low");
    expect(resolveTier("auto", "medium")).toBe("medium");
  });
});
