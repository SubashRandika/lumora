import { describe, expect, it } from "vitest";
import {
  CAST_PHASES,
  totalCastDuration,
  transition,
  type CastEvent,
  type SpellCastState,
} from "./castMachine";

const run = (start: SpellCastState, events: CastEvent[]) =>
  events.reduce<SpellCastState>((state, event) => transition(state, event), start);

const ADVANCE: CastEvent = { type: "ADVANCE" };

describe("castMachine", () => {
  it("walks the full happy path", () => {
    const visited: SpellCastState[] = [];
    let state = transition("idle", { type: "CAST" });
    visited.push(state);
    for (let i = 0; i < CAST_PHASES.length; i++) {
      state = transition(state, ADVANCE);
      visited.push(state);
    }
    expect(visited).toEqual([
      "preparing",
      "casting",
      "projectile",
      "impact",
      "effect",
      "completed",
    ]);
  });

  it("allows casting again from completed and failed", () => {
    expect(transition("completed", { type: "CAST" })).toBe("preparing");
    expect(transition("failed", { type: "CAST" })).toBe("preparing");
  });

  it("ignores CAST while a cast is in progress (double-click safe)", () => {
    for (const phase of CAST_PHASES) {
      expect(transition(phase, { type: "CAST" })).toBe(phase);
    }
  });

  it("fails and cancels only from in-progress phases", () => {
    expect(transition("projectile", { type: "FAIL", reason: "renderer-lost" })).toBe(
      "failed",
    );
    expect(transition("idle", { type: "FAIL", reason: "unknown" })).toBe("idle");
    expect(transition("casting", { type: "CANCEL" })).toBe("idle");
    expect(transition("completed", { type: "CANCEL" })).toBe("completed");
  });

  it("resets only from terminal states", () => {
    expect(transition("completed", { type: "RESET" })).toBe("idle");
    expect(transition("failed", { type: "RESET" })).toBe("idle");
    expect(transition("effect", { type: "RESET" })).toBe("effect");
  });

  it("does not advance out of idle or terminal states", () => {
    expect(run("idle", [ADVANCE, ADVANCE])).toBe("idle");
    expect(run("completed", [ADVANCE])).toBe("completed");
  });

  it("sums phase durations", () => {
    expect(
      totalCastDuration({
        preparing: 0.5,
        casting: 1,
        projectile: 0,
        impact: 0.25,
        effect: 2,
      }),
    ).toBe(3.75);
  });
});
