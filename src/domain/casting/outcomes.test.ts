import { describe, expect, it } from "vitest";
import { spellRegistry } from "@/data/registry";
import {
  blendPoseToRest,
  blendToRest,
  DOOR_OPEN_ANGLE,
  LEG_LOCK_BOUND,
  LEG_LOCK_REST,
  LEG_LOCK_TIMING,
  legLockPose,
  levitationPose,
  MEND_LIFT,
  MEND_MENDED,
  MEND_REST,
  MEND_TIMING,
  mendPose,
  planMend,
  planLegLock,
  burntAmount,
  CLOAK_HEM,
  CLOAK_TOP,
  EMBER_HOLD,
  HEM_BURNT,
  IGNITE_BURNT,
  IGNITE_REST,
  IGNITE_TIMING,
  ignitePose,
  planIgnite,
  type IgnitePose,
  planSunburst,
  SUN_GLOW,
  SUNBURST_REST,
  SUNBURST_TIMING,
  SUNBURST_WITHERED,
  sunburstPose,
  VINE_STUB,
  witheredAmount,
  type SunburstPose,
  outcomeReleaseAt,
  outcomeSoundEvents,
  FROST_BOTTOM,
  FROST_TOP,
  petrifyPose,
  PETRIFY_FROZEN,
  PETRIFY_REST,
  PETRIFY_TIMING,
  planPetrify,
  planLevitation,
  planUnlock,
  REST_POSE,
  UNLOCK_OPEN,
  UNLOCK_REST,
  UNLOCK_TIMING,
  unlockPose,
  type LegLockPose,
  type MendPose,
  type PetrifyPose,
  type UnlockPose,
} from "./outcomes";

const LEVITATE = {
  kind: "levitate",
  liftHeight: 1.4,
  hoverSeconds: 3,
  spinTurns: 0.5,
} as const;
const IGNITE = { kind: "ignite", flameSeconds: 2.5 } as const;
const TAU = Math.PI * 2;

const sample = (from: number, to: number, steps = 400) =>
  Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

describe("planLevitation", () => {
  it("keeps natural segment lengths when the effect phase has room", () => {
    const plan = planLevitation(LEVITATE, 6.6);
    expect(plan.hover).toBe(3);
    expect(plan.total).toBeCloseTo(6.45);
    expect(plan.landAt).toBeCloseTo(6);
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planLevitation(LEVITATE, 3.225);
    expect(plan.total).toBeCloseTo(3.225);
    expect(plan.hover).toBeCloseTo(1.5);
  });

  it("lands after whole turns only", () => {
    expect(planLevitation(LEVITATE, 6).spinTotal).toBeCloseTo(TAU);
    expect(planLevitation({ ...LEVITATE, spinTurns: 2 }, 6).spinTotal).toBeCloseTo(
      2 * TAU,
    );
    expect(planLevitation({ ...LEVITATE, spinTurns: 0 }, 6).spinTotal).toBe(0);
  });
});

describe("levitationPose", () => {
  const plan = planLevitation(LEVITATE, 6);

  it("starts and ends at rest", () => {
    expect(levitationPose(plan, 0)).toEqual(REST_POSE);
    expect(levitationPose(plan, plan.total)).toEqual(REST_POSE);
    expect(levitationPose(plan, plan.total + 5)).toEqual(REST_POSE);
  });

  it("rises steadily to the lift height", () => {
    const heights = sample(0, plan.rise).map((t) => levitationPose(plan, t, true).lift);
    heights.slice(1).forEach((h, i) => expect(h).toBeGreaterThanOrEqual(heights[i]!));
    expect(levitationPose(plan, plan.rise + plan.hover / 2).lift).toBeCloseTo(1.4, 1);
  });

  it("never jumps: the height is continuous across the whole float", () => {
    const times = sample(0, plan.total, 2000);
    const heights = times.map((t) => levitationPose(plan, t).lift);
    heights
      .slice(1)
      .forEach((h, i) => expect(Math.abs(h - heights[i]!)).toBeLessThan(0.02));
  });

  it("touches down at landAt facing the way it started", () => {
    const landed = levitationPose(plan, plan.landAt + 1e-6);
    expect(landed.lift).toBeLessThan(0.001);
    expect(landed.spin % TAU).toBeCloseTo(0);
  });

  it("with reduced motion, still lifts but doesn't spin, bob, or tilt", () => {
    const hovering = sample(plan.rise, plan.rise + plan.hover, 50).map((t) =>
      levitationPose(plan, t, true),
    );
    for (const pose of hovering) {
      expect(pose.lift).toBeCloseTo(1.4);
      expect(pose.spin).toBe(0);
      expect(pose.tiltX).toBe(0);
      expect(pose.tiltZ).toBe(0);
    }
  });
});

describe("blendToRest", () => {
  it("returns the pose to rest at the nearest whole turn", () => {
    const from = {
      lift: 1.2,
      spin: TAU * 0.9,
      tiltX: 0.05,
      tiltZ: -0.04,
      open: 0.8,
      glow: 1,
    };
    expect(blendToRest(from, 0)).toEqual(from);
    const rest = blendToRest(from, 1);
    expect(rest.lift).toBeCloseTo(0);
    expect(rest.spin).toBeCloseTo(TAU);
    expect(rest.glow).toBeCloseTo(0);
  });
});

describe("planUnlock", () => {
  const natural = Object.values(UNLOCK_TIMING).reduce((a, b) => a + b, 0);

  it("keeps natural lengths when the effect phase has room, in order", () => {
    const plan = planUnlock(3.5);
    expect(plan.total).toBeCloseTo(natural);
    expect(plan.total).toBeLessThanOrEqual(3.5);
    const marks = [0, plan.unlatchAt, plan.dropAt, plan.openAt, plan.openEnd, plan.total];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planUnlock(natural / 2);
    expect(plan.total).toBeCloseTo(natural / 2);
    expect(plan.open).toBeCloseTo(UNLOCK_TIMING.open / 2);
  });

  it("fits Alohomora's own effect phase", () => {
    const alohomora = spellRegistry.getById("alohomora")!;
    expect(planUnlock(alohomora.timeline.effect).total).toBeLessThanOrEqual(
      alohomora.timeline.effect,
    );
  });
});

describe("unlockPose", () => {
  const plan = planUnlock(3.5);
  const KEYS = Object.keys(UNLOCK_REST) as Array<keyof UnlockPose>;

  it("starts shut, locked, and warded", () => {
    expect(unlockPose(plan, 0)).toEqual(UNLOCK_REST);
    expect(unlockPose(plan, -1)).toEqual(UNLOCK_REST);
  });

  it("ends open and stays open, with light spilling through", () => {
    expect(unlockPose(plan, plan.total)).toEqual(UNLOCK_OPEN);
    expect(unlockPose(plan, plan.total + 60)).toEqual(UNLOCK_OPEN);
    expect(UNLOCK_OPEN.doorOpen).toBe(DOOR_OPEN_ANGLE);
    expect(UNLOCK_OPEN.doorOpen).toBeLessThan(Math.PI / 2);
    expect(UNLOCK_OPEN.spill).toBe(1);
    expect(UNLOCK_OPEN.ward).toBe(0);
    for (const reduced of [false, true]) {
      const nearEnd = unlockPose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS) expect(nearEnd[key], key).toBeCloseTo(UNLOCK_OPEN[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        unlockPose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("breaks the ward before the shackle opens, and opens the lock before the door moves", () => {
    const beforeUnlatch = unlockPose(plan, plan.unlatchAt - 1e-3);
    expect(beforeUnlatch.ward).toBeLessThan(0.02);
    expect(beforeUnlatch.shackleLift).toBe(0);
    const beforeOpen = unlockPose(plan, plan.openAt - 1e-3);
    expect(beforeOpen.shackleTurn).toBeCloseTo(1.4);
    expect(beforeOpen.doorOpen).toBe(0);
    expect(unlockPose(plan, plan.openEnd).spill).toBeGreaterThan(0.99);
  });

  it("with reduced motion, still unlocks and opens but doesn't swing, sway, or drift", () => {
    const poses = sample(0, plan.total, 600).map((t) => unlockPose(plan, t, true));
    for (const pose of poses) {
      expect(pose.lockSwing).toBe(0);
      expect(pose.lockSway).toBe(0);
      expect(pose.shackleLift).toBeLessThanOrEqual(0.035 + 1e-9);
      expect(pose.doorOpen).toBeLessThanOrEqual(DOOR_OPEN_ANGLE + 1e-9);
    }
  });
});

describe("blendPoseToRest", () => {
  it("eases an open door back to shut and warded", () => {
    expect(blendPoseToRest(UNLOCK_OPEN, UNLOCK_REST, 0)).toEqual(UNLOCK_OPEN);
    const halfway = blendPoseToRest(UNLOCK_OPEN, UNLOCK_REST, 0.5);
    expect(halfway.doorOpen).toBeGreaterThan(0);
    expect(halfway.doorOpen).toBeLessThan(DOOR_OPEN_ANGLE);
    const rest = blendPoseToRest(UNLOCK_OPEN, UNLOCK_REST, 1);
    for (const key of Object.keys(UNLOCK_REST) as Array<keyof UnlockPose>) {
      expect(rest[key], key).toBeCloseTo(UNLOCK_REST[key]);
    }
  });
});

describe("planPetrify", () => {
  const natural = Object.values(PETRIFY_TIMING).reduce((a, b) => a + b, 0);

  it("keeps natural lengths when the effect phase has room, in order", () => {
    const plan = planPetrify(3.2);
    expect(plan.total).toBeCloseTo(natural);
    const marks = [0, plan.freezeAt, plan.frozenAt, plan.holdAt, plan.total];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
    expect(plan.rockAt).toBe(plan.frozenAt);
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planPetrify(natural / 2);
    expect(plan.total).toBeCloseTo(natural / 2);
    expect(plan.freeze).toBeCloseTo(PETRIFY_TIMING.freeze / 2);
  });

  it("fits Petrificus Totalus's own effect phase", () => {
    const spell = spellRegistry.getById("petrificus-totalus")!;
    expect(planPetrify(spell.timeline.effect).total).toBeLessThanOrEqual(
      spell.timeline.effect,
    );
  });
});

describe("petrifyPose", () => {
  const plan = planPetrify(3.2);
  const KEYS = Object.keys(PETRIFY_REST) as Array<keyof PetrifyPose>;

  it("starts at rest: arms out, upright, no frost", () => {
    expect(petrifyPose(plan, 0)).toEqual(PETRIFY_REST);
    expect(petrifyPose(plan, -1)).toEqual(PETRIFY_REST);
  });

  it("ends frozen and stays frozen", () => {
    expect(petrifyPose(plan, plan.total)).toEqual(PETRIFY_FROZEN);
    expect(petrifyPose(plan, plan.total + 60)).toEqual(PETRIFY_FROZEN);
    expect(PETRIFY_FROZEN).toMatchObject({ armBind: 1, frostLine: FROST_TOP, frost: 1 });
    for (const reduced of [false, true]) {
      const nearEnd = petrifyPose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS)
        expect(nearEnd[key], key).toBeCloseTo(PETRIFY_FROZEN[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        petrifyPose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("clamps the arms before any frost appears", () => {
    const bound = petrifyPose(plan, plan.freezeAt);
    expect(bound.armBind).toBeCloseTo(1);
    expect(bound.frostLine).toBeCloseTo(FROST_BOTTOM);
  });

  it("frost climbs steadily from the base to over the head, with a glowing edge", () => {
    const lines = sample(plan.freezeAt, plan.frozenAt, 200).map(
      (t) => petrifyPose(plan, t).frostLine,
    );
    lines.slice(1).forEach((line, i) => expect(line).toBeGreaterThanOrEqual(lines[i]!));
    const halfway = petrifyPose(plan, plan.freezeAt + plan.freeze / 2);
    expect(halfway.frostLine).toBeGreaterThan(0.7);
    expect(halfway.frostLine).toBeLessThan(1.4);
    expect(halfway.frostRim).toBeGreaterThan(0.9);
    expect(halfway.frost).toBe(1);
  });

  it("rocks once while frozen, but not with reduced motion", () => {
    const rocking = sample(plan.rockAt, plan.holdAt, 100).map((t) =>
      petrifyPose(plan, t),
    );
    expect(Math.max(...rocking.map((p) => Math.abs(p.tiltZ)))).toBeGreaterThan(0.02);
    const poses = sample(0, plan.total, 600).map((t) => petrifyPose(plan, t, true));
    for (const pose of poses) {
      expect(pose.tiltX).toBe(0);
      expect(pose.tiltZ).toBe(0);
    }
    expect(Math.max(...poses.map((p) => p.frostLine))).toBeCloseTo(FROST_TOP);
  });

  it("thaws back to rest when blended (the next cast or a cancel)", () => {
    const halfway = blendPoseToRest(PETRIFY_FROZEN, PETRIFY_REST, 0.5);
    expect(halfway.frostLine).toBeGreaterThan(FROST_BOTTOM);
    expect(halfway.frostLine).toBeLessThan(FROST_TOP);
    const rest = blendPoseToRest(PETRIFY_FROZEN, PETRIFY_REST, 1);
    for (const key of KEYS) expect(rest[key], key).toBeCloseTo(PETRIFY_REST[key]);
  });
});

describe("planLegLock", () => {
  const natural = Object.values(LEG_LOCK_TIMING).reduce((a, b) => a + b, 0);

  it("keeps natural lengths when the effect phase has room, in order", () => {
    const plan = planLegLock(3.7);
    expect(plan.total).toBeCloseTo(natural);
    const marks = [0, plan.hopAt, plan.teeterAt, plan.settleAt, plan.total];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
  });

  it("fills the hop segment with three hops, back to back", () => {
    const plan = planLegLock(3.7);
    expect(plan.hops).toHaveLength(3);
    expect(plan.hops[0]!.start).toBeCloseTo(plan.hopAt);
    plan.hops
      .slice(1)
      .forEach((hop, i) => expect(hop.start).toBeCloseTo(plan.hops[i]!.end));
    expect(plan.hops.at(-1)!.end).toBeCloseTo(plan.teeterAt);
    plan.hops
      .slice(1)
      .forEach((hop, i) => expect(hop.height).toBeLessThan(plan.hops[i]!.height));
  });

  it("fits Locomotor Mortis's own effect phase", () => {
    const spell = spellRegistry.getById("locomotor-mortis")!;
    expect(planLegLock(spell.timeline.effect).total).toBeLessThanOrEqual(
      spell.timeline.effect,
    );
  });
});

describe("legLockPose", () => {
  const plan = planLegLock(3.7);
  const KEYS = Object.keys(LEG_LOCK_REST) as Array<keyof LegLockPose>;

  it("starts unbound, ends bound, and stays bound", () => {
    expect(legLockPose(plan, 0)).toEqual(LEG_LOCK_REST);
    expect(legLockPose(plan, plan.total)).toEqual(LEG_LOCK_BOUND);
    expect(legLockPose(plan, plan.total + 60)).toEqual(LEG_LOCK_BOUND);
    for (const reduced of [false, true]) {
      const nearEnd = legLockPose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS)
        expect(nearEnd[key], key).toBeCloseTo(LEG_LOCK_BOUND[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        legLockPose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("wraps the bands up the legs before they cinch, and cinches before the first hop", () => {
    const wrapping = legLockPose(plan, plan.bind * 0.4);
    expect(wrapping.bands).toBeGreaterThan(0.2);
    expect(wrapping.bands).toBeLessThan(1);
    expect(wrapping.cinch).toBe(0);
    const cinched = legLockPose(plan, plan.hopAt);
    expect(cinched.bands).toBeCloseTo(1);
    expect(cinched.cinch).toBeCloseTo(1);
    expect(cinched.lift).toBe(0);
  });

  it("hops three times, each lower, landing between hops", () => {
    const peaks = plan.hops.map(
      (hop) => legLockPose(plan, (hop.start + hop.end) / 2).lift,
    );
    expect(peaks[0]).toBeCloseTo(0.16);
    peaks.slice(1).forEach((peak, i) => expect(peak).toBeLessThan(peaks[i]!));
    for (const hop of plan.hops)
      expect(legLockPose(plan, hop.end - 1e-6).lift).toBeLessThan(1e-3);
  });

  it("teeters to a side and rights itself", () => {
    const teeter = sample(plan.teeterAt, plan.settleAt, 100).map((t) =>
      legLockPose(plan, t),
    );
    expect(Math.max(...teeter.map((p) => Math.abs(p.tiltZ)))).toBeGreaterThan(0.05);
    expect(legLockPose(plan, plan.settleAt).tiltZ).toBeCloseTo(0);
  });

  it("with reduced motion, still binds but doesn't hop, lean, or flail", () => {
    const poses = sample(0, plan.total, 600).map((t) => legLockPose(plan, t, true));
    for (const pose of poses) {
      expect(pose.lift).toBe(0);
      expect(pose.tiltX).toBe(0);
      expect(pose.tiltZ).toBe(0);
      expect(pose.armFlail).toBe(0);
    }
    expect(Math.max(...poses.map((p) => p.cinch))).toBeCloseTo(1);
  });

  it("releases back to rest when blended (the next cast or a cancel)", () => {
    const rest = blendPoseToRest(LEG_LOCK_BOUND, LEG_LOCK_REST, 1);
    for (const key of KEYS) expect(rest[key], key).toBeCloseTo(LEG_LOCK_REST[key]);
  });
});

describe("planMend", () => {
  const natural = Object.values(MEND_TIMING).reduce((a, b) => a + b, 0);

  it("keeps natural lengths when the effect phase has room, in order", () => {
    const plan = planMend(3);
    expect(plan.total).toBeCloseTo(natural);
    const marks = [
      0,
      plan.glowAt,
      plan.gatherAt,
      plan.sealAt,
      plan.ringAt,
      plan.settleAt,
      plan.total,
    ];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planMend(natural / 2);
    expect(plan.total).toBeCloseTo(natural / 2);
    expect(plan.seal).toBeCloseTo(MEND_TIMING.seal / 2);
  });

  it("fits Oculus Reparo's own effect phase", () => {
    const spell = spellRegistry.getById("oculus-reparo")!;
    expect(planMend(spell.timeline.effect).total).toBeLessThanOrEqual(
      spell.timeline.effect,
    );
  });
});

describe("mendPose", () => {
  const plan = planMend(3);
  const KEYS = Object.keys(MEND_REST) as Array<keyof MendPose>;

  it("starts cracked, ends mended, and stays mended", () => {
    expect(mendPose(plan, 0)).toEqual(MEND_REST);
    expect(MEND_REST).toMatchObject({ crack: 1, lensClear: 0, shards: 0 });
    expect(mendPose(plan, plan.total)).toEqual(MEND_MENDED);
    expect(mendPose(plan, plan.total + 60)).toEqual(MEND_MENDED);
    for (const reduced of [false, true]) {
      const nearEnd = mendPose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS) expect(nearEnd[key], key).toBeCloseTo(MEND_MENDED[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        mendPose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("lifts, glows along the crack, gathers the shards, then seals, in that order", () => {
    const lifted = mendPose(plan, plan.glowAt);
    expect(lifted.lift).toBeCloseTo(MEND_LIFT);
    expect(lifted.glowReach).toBe(0);
    const glowing = mendPose(plan, plan.gatherAt);
    expect(glowing.glowReach).toBeCloseTo(1);
    expect(glowing.crackGlow).toBeCloseTo(1);
    expect(glowing.shards).toBe(0);
    const gathered = mendPose(plan, plan.sealAt);
    expect(gathered.shards).toBeCloseTo(1);
    expect(gathered.crack).toBe(1);
    const sealed = mendPose(plan, plan.ringAt);
    expect(sealed.crack).toBeCloseTo(0);
    expect(sealed.lensClear).toBeCloseTo(1);
    expect(sealed.crackGlow).toBeCloseTo(0);
  });

  it("sweeps the rings once while it settles back onto the case", () => {
    const halfway = mendPose(plan, plan.ringAt + plan.ring / 2);
    expect(halfway.ring).toBeCloseTo(1);
    expect(halfway.ringAt).toBeCloseTo(0.5);
    expect(mendPose(plan, plan.settleAt).lift).toBeCloseTo(0);
  });

  it("with reduced motion, still seals and clears but doesn't lift or turn", () => {
    const poses = sample(0, plan.total, 600).map((t) => mendPose(plan, t, true));
    for (const pose of poses) {
      expect(pose.lift).toBe(0);
      expect(pose.turn).toBe(0);
    }
    expect(mendPose(plan, plan.ringAt, true).lensClear).toBeCloseTo(1);
  });

  it("cracks again when blended back to rest (the next cast or a cancel)", () => {
    const rest = blendPoseToRest(MEND_MENDED, MEND_REST, 1);
    for (const key of KEYS) expect(rest[key], key).toBeCloseTo(MEND_REST[key]);
  });
});

describe("planIgnite", () => {
  it("keeps natural lengths around flameSeconds when the effect phase has room", () => {
    const plan = planIgnite(IGNITE, 3.6);
    expect(plan.burn).toBe(2.5);
    expect(plan.catch).toBe(IGNITE_TIMING.catch);
    expect(plan.total).toBeCloseTo(3.6);
    const marks = [0, plan.burnAt, plan.dieAt, plan.settleAt, plan.total];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planIgnite(IGNITE, 1.8);
    expect(plan.total).toBeCloseTo(1.8);
    expect(plan.burn).toBeCloseTo(1.25);
  });

  it("fits Lacarnum Inflamari's own effect phase and flame time", () => {
    const spell = spellRegistry.getById("lacarnum-inflamari")!;
    const outcome = spell.visualEffect.outcome;
    if (outcome.kind !== "ignite") throw new Error("expected an ignite outcome");
    const plan = planIgnite(outcome, spell.timeline.effect);
    expect(plan.total).toBeLessThanOrEqual(spell.timeline.effect + 1e-9);
    expect(plan.burn).toBeCloseTo(outcome.flameSeconds);
  });
});

describe("ignitePose", () => {
  const plan = planIgnite(IGNITE, 3.6);
  const KEYS = Object.keys(IGNITE_REST) as Array<keyof IgnitePose>;

  it("starts whole, ends charred and smouldering, and stays that way", () => {
    expect(ignitePose(plan, 0)).toEqual(IGNITE_REST);
    expect(IGNITE_REST).toMatchObject({ flame: 0, char: 0, embers: 0 });
    expect(IGNITE_BURNT).toMatchObject({ flame: 0, char: 1, eaten: HEM_BURNT });
    expect(IGNITE_BURNT.embers).toBe(EMBER_HOLD);
    expect(ignitePose(plan, plan.total)).toEqual(IGNITE_BURNT);
    expect(ignitePose(plan, plan.total + 60)).toEqual(IGNITE_BURNT);
    for (const reduced of [false, true]) {
      const nearEnd = ignitePose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS) expect(nearEnd[key], key).toBeCloseTo(IGNITE_BURNT[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        ignitePose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("catches at the hem, climbs to the top while eating the hem, then goes out", () => {
    const caught = ignitePose(plan, plan.burnAt);
    expect(caught.flame).toBeGreaterThan(0.5);
    expect(caught.front).toBeLessThan(CLOAK_HEM + 0.2);
    expect(caught.eaten).toBe(IGNITE_REST.eaten);
    const halfway = ignitePose(plan, plan.burnAt + plan.burn / 2);
    expect(halfway.front).toBeGreaterThan(caught.front);
    expect(halfway.front).toBeLessThan(CLOAK_TOP);
    expect(halfway.flame).toBeCloseTo(1);
    const topped = ignitePose(plan, plan.dieAt);
    expect(topped.front).toBeCloseTo(CLOAK_TOP);
    expect(topped.eaten).toBeCloseTo(HEM_BURNT);
    expect(topped.flame).toBeCloseTo(1);
    expect(ignitePose(plan, plan.settleAt).flame).toBeCloseTo(0);
  });

  it("with reduced motion, still burns and chars but nothing flickers", () => {
    const poses = sample(0, plan.total, 600).map((t) => ignitePose(plan, t, true));
    for (const pose of poses) expect(pose.flicker).toBe(0);
    expect(ignitePose(plan, plan.dieAt, true).front).toBeCloseTo(CLOAK_TOP);
    expect(ignitePose(plan, plan.burnAt + 1).flicker).toBeGreaterThan(0);
  });

  it("is restored when blended back to rest (the next cast or a cancel)", () => {
    const rest = blendPoseToRest(IGNITE_BURNT, IGNITE_REST, 1);
    for (const key of KEYS) expect(rest[key], key).toBeCloseTo(IGNITE_REST[key]);
  });

  it("measures how burnt the cloak is, 0 whole to 1 burnt", () => {
    expect(burntAmount(IGNITE_REST)).toBe(0);
    expect(burntAmount(IGNITE_BURNT)).toBeCloseTo(1);
    expect(burntAmount(ignitePose(plan, plan.burnAt + plan.burn / 2))).toBeCloseTo(0.5);
  });
});

describe("planSunburst", () => {
  const natural = Object.values(SUNBURST_TIMING).reduce((a, b) => a + b, 0);

  it("keeps natural lengths when the effect phase has room, in order", () => {
    const plan = planSunburst(3.5);
    expect(plan.total).toBeCloseTo(natural);
    const marks = [0, plan.recoilAt, plan.retreatAt, plan.fadeAt, plan.total];
    marks.slice(1).forEach((mark, i) => expect(mark).toBeGreaterThan(marks[i]!));
    // The vines flinch while the light is still blooming.
    expect(plan.recoilAt).toBeLessThan(plan.flare);
  });

  it("shrinks every segment to fit a short effect phase", () => {
    const plan = planSunburst(natural / 2);
    expect(plan.total).toBeCloseTo(natural / 2);
    expect(plan.retreat).toBeCloseTo(SUNBURST_TIMING.retreat / 2);
  });

  it("fits Lumos Solem's own effect phase", () => {
    const spell = spellRegistry.getById("lumos-solem")!;
    expect(planSunburst(spell.timeline.effect).total).toBeLessThanOrEqual(
      spell.timeline.effect,
    );
  });
});

describe("sunburstPose", () => {
  const plan = planSunburst(3.5);
  const KEYS = Object.keys(SUNBURST_REST) as Array<keyof SunburstPose>;

  it("starts grown, ends withered back under a glow, and stays that way", () => {
    expect(sunburstPose(plan, 0)).toEqual(SUNBURST_REST);
    expect(SUNBURST_REST).toMatchObject({ reach: 1, sun: 0 });
    expect(SUNBURST_WITHERED).toMatchObject({ reach: VINE_STUB, sun: SUN_GLOW });
    expect(sunburstPose(plan, plan.total)).toEqual(SUNBURST_WITHERED);
    expect(sunburstPose(plan, plan.total + 60)).toEqual(SUNBURST_WITHERED);
    for (const reduced of [false, true]) {
      const nearEnd = sunburstPose(plan, plan.total - 1e-4, reduced);
      for (const key of KEYS)
        expect(nearEnd[key], key).toBeCloseTo(SUNBURST_WITHERED[key], 2);
    }
  });

  it("never jumps, with or without reduced motion", () => {
    for (const reduced of [false, true]) {
      const poses = sample(0, plan.total + 0.2, 3000).map((t) =>
        sunburstPose(plan, t, reduced),
      );
      for (const key of KEYS) {
        poses.slice(1).forEach((pose, i) => {
          expect(Math.abs(pose[key] - poses[i]![key]), `${key} at ${i}`).toBeLessThan(
            0.03,
          );
        });
      }
    }
  });

  it("blazes, the vines recoil, then they retreat as the light wanes, in that order", () => {
    const blazing = sunburstPose(plan, plan.flare);
    expect(blazing.sun).toBeCloseTo(1);
    expect(blazing.rays).toBeCloseTo(1);
    expect(blazing.reach).toBe(1);
    const recoiled = sunburstPose(plan, plan.retreatAt);
    expect(recoiled.recoil).toBeCloseTo(1);
    expect(recoiled.shiver).toBeCloseTo(1);
    expect(recoiled.reach).toBe(1);
    const retreated = sunburstPose(plan, plan.fadeAt);
    expect(retreated.reach).toBeCloseTo(VINE_STUB);
    expect(retreated.recoil).toBeCloseTo(0);
    expect(retreated.rays).toBeCloseTo(0);
    expect(retreated.sun).toBeGreaterThan(SUN_GLOW);
  });

  it("with reduced motion, still flares and retreats but doesn't lean or shiver", () => {
    const poses = sample(0, plan.total, 600).map((t) => sunburstPose(plan, t, true));
    for (const pose of poses) {
      expect(pose.recoil).toBe(0);
      expect(pose.shiver).toBe(0);
    }
    expect(sunburstPose(plan, plan.flare, true).sun).toBeCloseTo(1);
    expect(sunburstPose(plan, plan.fadeAt, true).reach).toBeCloseTo(VINE_STUB);
  });

  it("grows back when blended back to rest (the next cast or a cancel)", () => {
    const rest = blendPoseToRest(SUNBURST_WITHERED, SUNBURST_REST, 1);
    for (const key of KEYS) expect(rest[key], key).toBeCloseTo(SUNBURST_REST[key]);
  });

  it("measures how withered back the vines are, 0 grown to 1 stubs", () => {
    expect(witheredAmount(SUNBURST_REST)).toBe(0);
    expect(witheredAmount(SUNBURST_WITHERED)).toBeCloseTo(1);
    expect(
      witheredAmount(sunburstPose(plan, plan.retreatAt + plan.retreat / 2)),
    ).toBeCloseTo(0.5);
  });
});

describe("outcome timing", () => {
  it("sunburst releases the room and camera as the vines draw in", () => {
    const plan = planSunburst(3.5);
    const release = outcomeReleaseAt({ kind: "sunburst", intensity: 1 }, 3.5);
    expect(release).toBeGreaterThan(plan.retreatAt);
    expect(release).toBeLessThan(plan.fadeAt);
  });

  it("sunburst sounds the bloom, the rustle, and the retreat", () => {
    const plan = planSunburst(3.5);
    const events = outcomeSoundEvents({ kind: "sunburst", intensity: 1 }, 3.5);
    expect(events.map((e) => e.moment)).toEqual(["flare", "recoil", "retreat"]);
    expect(events[2]).toEqual({
      moment: "retreat",
      at: plan.retreatAt,
      duration: plan.retreat,
    });
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total + 1e-9);
  });

  it("mend releases the room and camera as the rings sweep round", () => {
    expect(outcomeReleaseAt({ kind: "mend" }, 3)).toBeCloseTo(planMend(3).ringAt);
  });

  it("mend sounds the glowing crack, the shards, the seal, and the rings", () => {
    const plan = planMend(3);
    const events = outcomeSoundEvents({ kind: "mend" }, 3);
    expect(events.map((e) => e.moment)).toEqual(["crack-glow", "shards", "seal", "ring"]);
    expect(events.find((e) => e.moment === "seal")?.at).toBeCloseTo(plan.sealAt);
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total + 1e-9);
  });

  it("leg-lock releases the room and camera once it stops teetering", () => {
    expect(outcomeReleaseAt({ kind: "leg-lock" }, 3.7)).toBeCloseTo(
      planLegLock(3.7).settleAt,
    );
  });

  it("leg-lock sounds the wrap, the cinch, each landing, and the teeter", () => {
    const plan = planLegLock(3.7);
    const events = outcomeSoundEvents({ kind: "leg-lock" }, 3.7);
    expect(events.map((e) => e.moment)).toEqual([
      "bands",
      "cinch",
      "hop",
      "hop",
      "hop",
      "teeter",
    ]);
    expect(events.filter((e) => e.moment === "hop").map((e) => e.at)).toEqual(
      plan.hops.map((hop) => hop.end),
    );
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total + 1e-9);
  });

  it("petrify releases the room and camera once its rock has died away", () => {
    expect(outcomeReleaseAt({ kind: "petrify" }, 3.2)).toBeCloseTo(
      planPetrify(3.2).holdAt,
    );
  });

  it("petrify sounds the clamp, the creeping frost, and the rock", () => {
    const plan = planPetrify(3.2);
    const events = outcomeSoundEvents({ kind: "petrify" }, 3.2);
    expect(events.map((e) => e.moment)).toEqual(["bind", "freeze", "rock"]);
    expect(events[1]).toEqual({
      moment: "freeze",
      at: plan.freezeAt,
      duration: plan.freeze,
    });
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total + 1e-9);
  });

  it("levitation releases the room and camera as the object starts down", () => {
    const plan = planLevitation(LEVITATE, 6);
    expect(outcomeReleaseAt(LEVITATE, 6)).toBeCloseTo(plan.rise + plan.hover);
  });

  it("unlock releases the room and camera once the door has swung open", () => {
    expect(outcomeReleaseAt({ kind: "unlock" }, 3.5)).toBeCloseTo(
      planUnlock(3.5).openEnd,
    );
  });

  it("ignite releases the firelight and camera as the flames die down", () => {
    expect(outcomeReleaseAt(IGNITE, 3.6)).toBeCloseTo(planIgnite(IGNITE, 3.6).dieAt);
  });

  it("ignite sounds the catch, a roar for the whole burn, and the hiss as it goes out", () => {
    const plan = planIgnite(IGNITE, 3.6);
    const events = outcomeSoundEvents(IGNITE, 3.6);
    expect(events.map((e) => e.moment)).toEqual(["kindle", "blaze", "douse"]);
    const blaze = events[1]!;
    expect(blaze.at + blaze.duration!).toBeCloseTo(plan.dieAt);
    expect(events[2]!.at).toBeCloseTo(plan.dieAt);
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total + 1e-9);
  });

  it("unlock sounds its moments in order, each inside the effect phase", () => {
    const plan = planUnlock(3.5);
    const events = outcomeSoundEvents({ kind: "unlock" }, 3.5);
    expect(events.map((e) => e.moment)).toEqual(["ward-break", "unlatch", "swing-open"]);
    events.slice(1).forEach((e, i) => expect(e.at).toBeGreaterThan(events[i]!.at));
    for (const e of events)
      expect(e.at + (e.duration ?? 0)).toBeLessThanOrEqual(plan.total);
  });

  it("levitation hums while aloft and sounds a landing", () => {
    const plan = planLevitation(LEVITATE, 6);
    expect(outcomeSoundEvents(LEVITATE, 6)).toEqual([
      { moment: "sustain", at: 0, duration: plan.landAt },
      { moment: "finish", at: plan.landAt },
    ]);
    expect(outcomeSoundEvents(LEVITATE, 0)).toEqual([]);
  });
});
