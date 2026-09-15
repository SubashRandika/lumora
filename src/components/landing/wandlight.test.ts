import { describe, expect, it } from "vitest";
import { resolveReducedMotion } from "@/hooks/useReducedMotion";
import { buildWallRows, distance, driftPosition, easeToward } from "./wandlight";

describe("driftPosition", () => {
  it("stays inside the hero at all times", () => {
    for (let t = 0; t < 80; t += 0.25) {
      const { x, y } = driftPosition(t);
      expect(x).toBeGreaterThan(0.2);
      expect(x).toBeLessThan(0.9);
      expect(y).toBeGreaterThan(0.2);
      expect(y).toBeLessThan(0.6);
    }
  });

  it("loops every 40 seconds", () => {
    const a = driftPosition(3);
    const b = driftPosition(43);
    expect(distance(a, b)).toBeLessThan(1e-9);
  });
});

describe("easeToward", () => {
  it("moves part of the way, never overshooting", () => {
    const next = easeToward({ x: 0, y: 0 }, { x: 1, y: 1 }, 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(1);
  });

  it("is frame-rate independent", () => {
    let sixty = { x: 0, y: 0 };
    for (let i = 0; i < 6; i++) sixty = easeToward(sixty, { x: 1, y: 0 }, 1 / 60);
    const ten = easeToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 1 / 10);
    expect(sixty.x).toBeCloseTo(ten.x, 6);
  });

  it("caps huge frame gaps (e.g. a background tab) to avoid jumps", () => {
    const next = easeToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 5);
    expect(next.x).toBeLessThan(1);
  });
});

describe("buildWallRows", () => {
  it("rotates the starting spell per row and repeats to overflow", () => {
    const rows = buildWallRows(["A", "B", "C", "D"], 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["A", "B", "C", "D", "A", "B", "C", "D"]);
    expect(rows[1]?.[0]).toBe("D");
    expect(rows[2]?.[0]).toBe("C");
  });

  it("returns no rows without incantations", () => {
    expect(buildWallRows([], 4)).toEqual([]);
  });
});

describe("resolveReducedMotion", () => {
  it("lets the Settings choice override the device", () => {
    expect(resolveReducedMotion("reduce", false)).toBe(true);
    expect(resolveReducedMotion("full", true)).toBe(false);
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
  });
});
