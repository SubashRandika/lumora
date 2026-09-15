import { describe, expect, it } from "vitest";
import { WAND_MOTION_PRESETS } from "@/domain/spells/spell.schema";
import { allSpells } from "@/data/spells";
import {
  describeWandMotion,
  fitGesture,
  pathEnds,
  resolveWandPath,
  toSvgPath,
} from "./wandPath";

describe("resolveWandPath", () => {
  it.each(WAND_MOTION_PRESETS.map((p) => [p]))(
    "preset %s has at least two points inside the unit square",
    (preset) => {
      const points = resolveWandPath({ type: preset, duration: 1 });
      expect(points.length).toBeGreaterThanOrEqual(2);
      for (const p of points) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      }
    },
  );

  it("uses custom points as given", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
    ];
    expect(resolveWandPath({ type: "custom", points, duration: 1 })).toBe(points);
  });

  it("describes every spell's motion", () => {
    for (const spell of allSpells) {
      expect(describeWandMotion(spell.wandMotion)).toMatch(/\.$/);
    }
  });

  it("ends swish-and-flick with an upward flick", () => {
    const points = resolveWandPath({ type: "swish-and-flick", duration: 1 });
    const last = points.at(-1)!;
    const beforeLast = points.at(-2)!;
    expect(last.y).toBeGreaterThan(beforeLast.y + 0.3);
  });
});

describe("toSvgPath", () => {
  it("flips y and fits the path inside the padded square", () => {
    const d = toSvgPath(
      [
        { x: -1, y: 1 },
        { x: 1, y: -1 },
      ],
      100,
      10,
    );
    expect(d.startsWith("M10 10")).toBe(true);
    expect(d.endsWith("90 90")).toBe(true);
  });

  it("produces one cubic segment per gap between points", () => {
    const d = toSvgPath(resolveWandPath({ type: "circle", duration: 1 }), 64);
    expect(d.match(/C/g)).toHaveLength(16);
  });

  it("handles degenerate input", () => {
    expect(toSvgPath([], 64)).toBe("");
    expect(toSvgPath([{ x: 0, y: 0 }], 64)).toBe("M32 32");
  });
});

describe("fitGesture", () => {
  it("centres a small gesture and scales its longest side to the extent", () => {
    const fitted = fitGesture(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2, z: 1 },
      ],
      1.6,
    );
    expect(fitted[0]?.x).toBeCloseTo(-0.8);
    expect(fitted[0]?.y).toBeCloseTo(-0.4);
    expect(fitted[1]?.x).toBeCloseTo(0.8);
    expect(fitted[1]?.y).toBeCloseTo(0.4);
    expect(fitted[1]?.z).toBe(1);
  });

  it("collapses a single-position gesture to the centre", () => {
    expect(
      fitGesture([
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe("pathEnds", () => {
  it("points the arrow along the final segment", () => {
    const ends = pathEnds(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      100,
    );
    expect(ends?.endAngle).toBe(0);
    expect(ends?.start).toEqual({ x: 50, y: 50 });
  });
});
