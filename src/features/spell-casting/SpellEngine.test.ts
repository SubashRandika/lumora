import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpellCastState } from "@/domain/casting/castMachine";
import type {
  PhaseCue,
  SpellEngineEvent,
  SpellPerformer,
} from "@/domain/casting/engine.types";
import { spellRegistry } from "@/data/registry";
import { createSpellEngine, phaseInfo } from "./SpellEngine";

const alohomora = spellRegistry.getById("alohomora")!;
// preparing 0.3, casting 1, projectile 0.5, impact 0.4, effect 3.5 → 5.7 s
const TOTAL_MS = 5700;

function recorder(overrides: Partial<SpellPerformer> = {}) {
  const cues: PhaseCue[] = [];
  const performer: SpellPerformer = {
    id: "recorder",
    perform: (cue) => {
      cues.push(cue);
    },
    reset: vi.fn(),
    ...overrides,
  };
  return { performer, cues };
}

function setup(
  options: Parameters<typeof createSpellEngine>[0] extends infer O
    ? Partial<O>
    : never = {},
) {
  const engine = createSpellEngine({
    getSpell: (id) => spellRegistry.getById(id),
    ...options,
  });
  const states: SpellCastState[] = [];
  const events: SpellEngineEvent[] = [];
  engine.subscribe((event) => {
    events.push(event);
    if (event.type === "state") states.push(event.state);
  });
  return { engine, states, events };
}

describe("SpellEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs every phase in order and cues performers with the spell's timings", async () => {
    const { engine, states } = setup();
    const { performer, cues } = recorder();
    engine.registerPerformer(performer);

    const done = engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10);

    await expect(done).resolves.toBe("completed");
    expect(states).toEqual([
      "preparing",
      "casting",
      "projectile",
      "impact",
      "effect",
      "completed",
    ]);
    expect(cues.map((c) => [c.phase, c.duration])).toEqual([
      ["preparing", 0.3],
      ["casting", 1],
      ["projectile", 0.5],
      ["impact", 0.4],
      ["effect", 3.5],
    ]);
  });

  it("does not advance before the planned duration, even if performers finish instantly", async () => {
    const { engine } = setup();
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(250);
    expect(engine.getState()).toBe("preparing");
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.getState()).toBe("casting");
  });

  it("waits for a slow performer before advancing", async () => {
    const { engine } = setup();
    engine.registerPerformer({
      id: "slow",
      perform: (cue) =>
        cue.phase === "preparing"
          ? new Promise((resolve) => setTimeout(resolve, 1000))
          : undefined,
      reset: () => {},
    });
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(600);
    expect(engine.getState()).toBe("preparing");
    await vi.advanceTimersByTimeAsync(450);
    expect(engine.getState()).toBe("casting");
  });

  it("abandons a performer that never settles, after the grace period", async () => {
    const { engine } = setup({ performerGraceMs: 500 });
    engine.registerPerformer({
      id: "stuck",
      perform: (cue) => (cue.phase === "preparing" ? new Promise(() => {}) : undefined),
      reset: () => {},
    });
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(300 + 500 + 10);
    expect(engine.getState()).toBe("casting");
  });

  it("ignores a second cast while one is running (double-click safe)", async () => {
    const { engine } = setup();
    const { performer, cues } = recorder();
    engine.registerPerformer(performer);
    void engine.cast({ spellId: "alohomora", input: "button" });
    await engine.cast({ spellId: "alohomora", input: "keyboard" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10);
    expect(cues.filter((c) => c.phase === "preparing")).toHaveLength(1);
  });

  it("cancels mid-cast: aborts the signal, resets performers, returns to idle", async () => {
    const { engine, states } = setup();
    const { performer, cues } = recorder();
    engine.registerPerformer(performer);

    const done = engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(800);
    expect(engine.getState()).toBe("casting");

    engine.cancel();
    await expect(done).resolves.toBe("idle");
    expect(cues.at(-1)?.signal.aborted).toBe(true);
    expect(performer.reset).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TOTAL_MS);
    expect(states.at(-1)).toBe("idle");
    expect(cues.map((c) => c.phase)).toEqual(["preparing", "casting"]);
  });

  it("fails when a performer throws, and reports why", async () => {
    const { engine, events } = setup();
    engine.registerPerformer({
      id: "broken",
      perform: (cue) => {
        if (cue.phase === "projectile") throw new Error("shader exploded");
      },
      reset: () => {},
    });
    const done = engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS);
    await expect(done).resolves.toBe("failed");
    expect(events.at(-1)).toEqual({
      type: "failed",
      spellId: "alohomora",
      reason: "unknown",
    });
  });

  it("fails with assets-unavailable when a preload rejects", async () => {
    const { engine } = setup();
    engine.registerPerformer({
      id: "loader",
      preload: () => Promise.reject(new Error("404")),
      perform: () => {},
      reset: () => {},
    });
    const done = engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(10);
    await expect(done).resolves.toBe("failed");
  });

  it("casts again from completed, and resets to idle", async () => {
    const { engine } = setup();
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10);
    expect(engine.getState()).toBe("completed");

    engine.reset();
    expect(engine.getState()).toBe("idle");

    void engine.cast({ spellId: "wingardium-leviosa", input: "button" });
    expect(engine.getState()).toBe("preparing");
  });

  it("passes reduced motion to performers", async () => {
    const { engine } = setup({ getReducedMotion: () => true });
    const { performer, cues } = recorder();
    engine.registerPerformer(performer);
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(10);
    expect(cues[0]?.reducedMotion).toBe(true);
  });

  it("ignores unknown spells", async () => {
    const { engine, states } = setup();
    await expect(engine.cast({ spellId: "avada", input: "button" })).resolves.toBe(
      "idle",
    );
    expect(states).toEqual([]);
  });

  it("stops using a performer once it unregisters, resetting it", async () => {
    const { engine } = setup();
    const { performer, cues } = recorder();
    const unregister = engine.registerPerformer(performer);
    unregister();
    expect(performer.reset).toHaveBeenCalled();
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10);
    expect(cues).toEqual([]);
  });

  it("reports each phase's position in the cast, for progress bars", async () => {
    const { engine, events } = setup();
    void engine.cast({ spellId: "alohomora", input: "button" });
    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10);
    const casting = events.find((e) => e.type === "state" && e.state === "casting");
    expect(casting).toMatchObject({
      phase: { duration: 1, startFraction: 0.3 / 5.7 },
    });
  });
});

describe("phaseInfo", () => {
  it("spans the whole cast across phases", () => {
    expect(phaseInfo(alohomora, "preparing").startFraction).toBe(0);
    expect(phaseInfo(alohomora, "effect").endFraction).toBeCloseTo(1);
  });
});
