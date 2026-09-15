import { describe, expect, it } from "vitest";
import { createRandom } from "./random";

describe("createRandom", () => {
  it("is deterministic for a seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("stays within [0, 1) and within ranges", () => {
    const r = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const x = r.range(-2, 3);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(3);
    }
  });

  it("differs between seeds", () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });
});
