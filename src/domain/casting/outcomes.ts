import type { OutcomeSoundMoment, SpellOutcome } from "@/domain/spells/spell.schema";

/*
 * Timing and motion for spell outcomes, as pure functions of time. The 3D
 * layer samples these every frame and the audio performer schedules against
 * them, so picture and sound agree without talking to each other.
 */

type Levitate = Extract<SpellOutcome, { kind: "levitate" }>;

/** Unscaled segment lengths, in seconds, around the data's `hoverSeconds`. */
export const LEVITATION_TIMING = { rise: 1.5, descend: 1.5, settle: 0.45 } as const;

export interface LevitationPlan {
  rise: number;
  hover: number;
  descend: number;
  settle: number;
  /** Seconds into the effect when the object touches down. */
  landAt: number;
  /** Seconds into the effect when it is back at rest. */
  total: number;
  liftHeight: number;
  /** Radians turned by the end of the hover. */
  spinUp: number;
  /** Radians turned by touchdown: always whole turns, so it lands as it started. */
  spinTotal: number;
}

export interface LevitationPose {
  /** Metres above the resting position. */
  lift: number;
  /** Radians about the vertical axis. */
  spin: number;
  tiltX: number;
  tiltZ: number;
  /** 0 closed to 1 fully eased open (the tome's cover). */
  open: number;
  /** 0 to 1: glow and sparkles around the floating object. */
  glow: number;
}

export const REST_POSE: Readonly<LevitationPose> = {
  lift: 0,
  spin: 0,
  tiltX: 0,
  tiltZ: 0,
  open: 0,
  glow: 0,
};

const TAU = Math.PI * 2;
const BOB_HEIGHT = 0.06;
const BOB_PERIOD = 1.6;
const BOUNCE_HEIGHT = 0.035;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
/** Zero velocity at both ends, with a softer start than a sine. */
const easeInOutCubic = (x: number) => {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};

/**
 * Fits a levitation into the effect phase. Segments keep their natural
 * lengths when there is room and shrink proportionally when there isn't;
 * any time left over is spent at rest.
 */
export function planLevitation(outcome: Levitate, effectSeconds: number): LevitationPlan {
  const natural = {
    rise: LEVITATION_TIMING.rise,
    hover: outcome.hoverSeconds,
    descend: LEVITATION_TIMING.descend,
    settle: LEVITATION_TIMING.settle,
  };
  const required = natural.rise + natural.hover + natural.descend + natural.settle;
  const scale = required > effectSeconds ? Math.max(0, effectSeconds) / required : 1;
  const rise = natural.rise * scale;
  const hover = natural.hover * scale;
  const descend = natural.descend * scale;
  const settle = natural.settle * scale;
  const spinUp = outcome.spinTurns * TAU;
  return {
    rise,
    hover,
    descend,
    settle,
    landAt: rise + hover + descend,
    total: rise + hover + descend + settle,
    liftHeight: outcome.liftHeight,
    spinUp,
    spinTotal: Math.max(0, Math.ceil(outcome.spinTurns - 1e-9)) * TAU,
  };
}

/**
 * The object's pose `t` seconds into the effect. With reduced motion it
 * still rises, hovers, and returns, but doesn't spin, bob, tilt, or bounce.
 */
export function levitationPose(
  plan: LevitationPlan,
  t: number,
  reducedMotion = false,
): LevitationPose {
  if (!(t > 0) || t >= plan.total) return { ...REST_POSE };

  const { rise, hover, descend, liftHeight } = plan;
  const hoverEnd = rise + hover;
  let lift: number;
  let spin: number;
  let bob = 0;
  let bounce = 0;

  if (t < rise) {
    lift = liftHeight * easeInOutCubic(t / rise);
  } else if (t < hoverEnd) {
    lift = liftHeight;
    // The bob fades in and out so the height stays continuous at both ends.
    const h = (t - rise) / hover;
    bob = BOB_HEIGHT * Math.sin((TAU * (t - rise)) / BOB_PERIOD) * Math.sin(Math.PI * h);
  } else if (t < plan.landAt) {
    lift = liftHeight * (1 - easeInOutCubic((t - hoverEnd) / descend));
  } else {
    lift = 0;
    const s = (t - plan.landAt) / plan.settle;
    bounce = BOUNCE_HEIGHT * Math.abs(Math.sin(TAU * s)) * (1 - s) ** 2;
  }

  if (t < hoverEnd) spin = plan.spinUp * easeInOutSine(t / hoverEnd);
  else if (t < plan.landAt)
    spin =
      plan.spinUp +
      (plan.spinTotal - plan.spinUp) * easeInOutSine((t - hoverEnd) / descend);
  else spin = plan.spinTotal;

  const air = liftHeight > 0 ? clamp01(lift / liftHeight) : 0;
  const open = easeInOutSine(clamp01(air * 1.25));
  const glow = clamp01(air * 1.6);

  if (reducedMotion) return { lift, spin: 0, tiltX: 0, tiltZ: 0, open, glow };
  return {
    lift: lift + bob + bounce,
    spin,
    tiltX: 0.09 * Math.sin(t * 1.3) * air,
    tiltZ: 0.07 * Math.sin(t * 0.9 + 1) * air,
    open,
    glow,
  };
}

/** Moves a pose part of the way to rest: `k` 0 keeps it, 1 is at rest. Spin returns to the nearest whole turn. */
export function blendToRest(from: LevitationPose, k: number): LevitationPose {
  const u = 1 - easeInOutSine(k);
  const restSpin = Math.round(from.spin / TAU) * TAU;
  return {
    lift: from.lift * u,
    spin: restSpin + (from.spin - restSpin) * u,
    tiltX: from.tiltX * u,
    tiltZ: from.tiltZ * u,
    open: from.open * u,
    glow: from.glow * u,
  };
}

/** Moves any all-number pose part of the way to its rest pose: `k` 0 keeps it, 1 is at rest. */
export function blendPoseToRest<T extends { [K in keyof T]: number }>(
  from: T,
  rest: Readonly<T>,
  k: number,
): T {
  const u = 1 - easeInOutSine(k);
  const out = { ...from };
  for (const key of Object.keys(rest) as Array<keyof T>) {
    const value: number = rest[key] + (from[key] - rest[key]) * u;
    out[key] = value as T[keyof T];
  }
  return out;
}

/**
 * Scales named segment lengths to fit `seconds`: natural lengths when there
 * is room, shrunk proportionally when there isn't.
 */
function fitSegments<K extends string>(
  natural: Readonly<Record<K, number>>,
  seconds: number,
): Record<K, number> {
  const keys = Object.keys(natural) as K[];
  const required = keys.reduce((sum, key) => sum + natural[key], 0);
  const scale = required > seconds ? Math.max(0, seconds) / required : 1;
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = natural[key] * scale;
  return out;
}

/* --------------------------------- Unlock --------------------------------- */

/** Unscaled segment lengths, in seconds, of an unlocking, in order. */
export const UNLOCK_TIMING = {
  /** The ward ring flares, cracks, and its pieces drift apart and fade. */
  wardBreak: 0.55,
  /** The shackle springs up and turns out of the lock body. */
  unlatch: 0.35,
  /** The padlock slips down on its hasp and starts to swing. */
  drop: 0.4,
  /** The door swings partly open; warm light spills through the gap. */
  open: 1.2,
  /** The door eases a touch wider and back, and the padlock's swing dies away. */
  settle: 0.9,
} as const;

/** How far the door opens, in radians (about 54°): partly open, not flung wide. */
export const DOOR_OPEN_ANGLE = 0.95;
const SHACKLE_LIFT = 0.035;
const SHACKLE_TURN = 1.4;
const LOCK_DROP = 0.035;
const LOCK_SWING = 0.32;
const LOCK_SWING_PERIOD = 0.85;
const LOCK_SWAY = 0.16;

export type UnlockSegments = Record<keyof typeof UNLOCK_TIMING, number>;

export interface UnlockPlan extends UnlockSegments {
  unlatchAt: number;
  dropAt: number;
  openAt: number;
  /** When the door has finished opening. */
  openEnd: number;
  /** Seconds into the effect when the door is still, held open. */
  total: number;
}

export interface UnlockPose {
  /** 0 gone to 1 intact: the ward ring's strength. */
  ward: number;
  /** 0 whole to 1 fully scattered: how far the ward's pieces have drifted apart. */
  wardSpread: number;
  /** 0 to 1: a bright flare as the ward breaks. */
  wardFlare: number;
  /** Metres the shackle has sprung up. */
  shackleLift: number;
  /** Radians the shackle has turned out about its leg. */
  shackleTurn: number;
  /** Metres the padlock has dropped on its hasp. */
  lockDrop: number;
  /** Radians the padlock swings side to side. */
  lockSwing: number;
  /** Radians the padlock sways toward and away from the door. */
  lockSway: number;
  /** Radians the door has swung open. */
  doorOpen: number;
  /** 0 to 1: warm light spilling through the gap. */
  spill: number;
}

/** Shut, locked, and warded: before a cast, and what cast again or cancel returns to. */
export const UNLOCK_REST: Readonly<UnlockPose> = {
  ward: 1,
  wardSpread: 0,
  wardFlare: 0,
  shackleLift: 0,
  shackleTurn: 0,
  lockDrop: 0,
  lockSwing: 0,
  lockSway: 0,
  doorOpen: 0,
  spill: 0,
};

/** Unlocked and standing open with light spilling through: how a finished unlocking stays. */
export const UNLOCK_OPEN: Readonly<UnlockPose> = {
  ward: 0,
  wardSpread: 1,
  wardFlare: 0,
  shackleLift: SHACKLE_LIFT,
  shackleTurn: SHACKLE_TURN,
  lockDrop: LOCK_DROP,
  lockSwing: 0,
  lockSway: 0,
  doorOpen: DOOR_OPEN_ANGLE,
  spill: 1,
};

/** Fits an unlocking into the effect phase; any time left over is spent standing open. */
export function planUnlock(effectSeconds: number): UnlockPlan {
  const s = fitSegments(UNLOCK_TIMING, effectSeconds);
  const unlatchAt = s.wardBreak;
  const dropAt = unlatchAt + s.unlatch;
  const openAt = dropAt + s.drop;
  const openEnd = openAt + s.open;
  return { ...s, unlatchAt, dropAt, openAt, openEnd, total: openEnd + s.settle };
}

const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** Overshoots a little past 1, then settles back: a spring. */
const easeOutBack = (x: number) => {
  const u = clamp01(x) - 1;
  const c = 1.9;
  return 1 + (c + 1) * u ** 3 + c * u ** 2;
};
/** Where `t` sits between `from` and `from + length`, clamped to 0–1. */
const progress = (t: number, from: number, length: number) =>
  length > 0 ? clamp01((t - from) / length) : t >= from ? 1 : 0;

/**
 * The door's pose `t` seconds into the effect: shut and warded at 0, open
 * from `total` on. The door stays open until the next cast (or a cancel)
 * returns it to rest. With reduced motion the ward still breaks and the door
 * still opens, but the padlock doesn't swing, the shackle doesn't overshoot,
 * and the door doesn't drift.
 */
export function unlockPose(
  plan: UnlockPlan,
  t: number,
  reducedMotion = false,
): UnlockPose {
  if (!(t > 0)) return { ...UNLOCK_REST };
  if (t >= plan.total) return { ...UNLOCK_OPEN };
  const pose: UnlockPose = { ...UNLOCK_REST };

  // Ward ring: flares and scatters, then stays gone.
  if (t < plan.unlatchAt) {
    const u = progress(t, 0, plan.wardBreak);
    pose.wardFlare =
      u < 0.35 ? easeOutCubic(u / 0.35) : 1 - easeInOutSine((u - 0.35) / 0.65);
    pose.wardSpread = easeInOutSine((u - 0.25) / 0.75);
    pose.ward = 1 - pose.wardSpread;
  } else {
    pose.ward = 0;
    pose.wardSpread = 1;
  }

  // Shackle: springs up and turns out, then stays open.
  if (t >= plan.unlatchAt) {
    const u = progress(t, plan.unlatchAt, plan.unlatch);
    const spring = reducedMotion ? easeInOutSine(u) : easeOutBack(u);
    pose.shackleLift = SHACKLE_LIFT * spring;
    pose.shackleTurn = SHACKLE_TURN * easeInOutSine((u - 0.35) / 0.65);
  }

  // Padlock: drops on its hasp and swings, sways as the door moves, and comes to hang still.
  if (t >= plan.dropAt) {
    pose.lockDrop = LOCK_DROP * easeOutCubic(progress(t, plan.dropAt, plan.drop));
    if (!reducedMotion) {
      const still = 1 - easeInOutSine(progress(t, plan.openEnd, plan.settle));
      const since = t - plan.dropAt;
      pose.lockSwing =
        LOCK_SWING *
        Math.sin((TAU * since) / LOCK_SWING_PERIOD) *
        Math.exp(-since * 1.1) *
        still;
      const moving = t - plan.openAt;
      if (moving > 0) {
        pose.lockSway =
          LOCK_SWAY * Math.sin((TAU * moving) / 0.9) * Math.exp(-moving * 2.2) * still;
      }
    }
  }

  // Door: swings open, then eases a touch wider and back to its resting angle.
  if (t >= plan.openAt && t < plan.openEnd) {
    pose.doorOpen = DOOR_OPEN_ANGLE * easeInOutCubic(progress(t, plan.openAt, plan.open));
  } else if (t >= plan.openEnd) {
    const drift = reducedMotion
      ? 0
      : 0.04 * Math.sin(Math.PI * progress(t, plan.openEnd, plan.settle));
    pose.doorOpen = DOOR_OPEN_ANGLE * (1 + drift);
  }

  pose.spill = clamp01(pose.doorOpen / DOOR_OPEN_ANGLE) ** 0.8;
  return pose;
}

/* --------------------------------- Petrify -------------------------------- */

/** Unscaled segment lengths, in seconds, of a petrification, in order. */
export const PETRIFY_TIMING = {
  /** The arms snap to the sides and the body jolts. */
  bind: 0.25,
  /** Grey, stone-like frost creeps up from the base to the top of the head. */
  freeze: 1.5,
  /** Frozen stiff, it rocks once on its base like a nudged statue. */
  rock: 0.9,
  /** It settles perfectly still, shimmering with cold, and stays frozen. */
  hold: 0.4,
} as const;

/** World heights the frost line travels between: just under the base, just over the head. */
export const FROST_BOTTOM = -0.05;
export const FROST_TOP = 2.05;
const BIND_JOLT = 0.05;
const ROCK_ANGLE = 0.06;

export type PetrifySegments = Record<keyof typeof PETRIFY_TIMING, number>;

export interface PetrifyPlan extends PetrifySegments {
  freezeAt: number;
  /** When the frost has reached the top of the head. */
  frozenAt: number;
  rockAt: number;
  holdAt: number;
  /** Seconds into the effect when it is still, and stays frozen. */
  total: number;
}

export interface PetrifyPose {
  /** 0 arms out as they rest, 1 clamped to the sides. */
  armBind: number;
  /** Radians pitched about the base: the jolt as the curse strikes. */
  tiltX: number;
  /** Radians rocked sideways about the base while frozen. */
  tiltZ: number;
  /** World height of the frost's edge: everything below it is frosted. */
  frostLine: number;
  /** 0 to 1: how strongly frost shows below the line. */
  frost: number;
  /** 0 to 1: the glowing edge where frost is spreading or receding. */
  frostRim: number;
  /** 0 to 1: cold shimmer on the frost and glints in the air. */
  chill: number;
}

/** Unfrozen, arms out, upright: before a cast, and what cast again or cancel returns to. */
export const PETRIFY_REST: Readonly<PetrifyPose> = {
  armBind: 0,
  tiltX: 0,
  tiltZ: 0,
  frostLine: FROST_BOTTOM,
  frost: 0,
  frostRim: 0,
  chill: 0,
};

/** Bound and frozen from base to head: how a finished petrification stays. */
export const PETRIFY_FROZEN: Readonly<PetrifyPose> = {
  armBind: 1,
  tiltX: 0,
  tiltZ: 0,
  frostLine: FROST_TOP,
  frost: 1,
  frostRim: 0,
  chill: 1,
};

/** Fits a petrification into the effect phase; any time left over is spent frozen. */
export function planPetrify(effectSeconds: number): PetrifyPlan {
  const s = fitSegments(PETRIFY_TIMING, effectSeconds);
  const freezeAt = s.bind;
  const frozenAt = freezeAt + s.freeze;
  const holdAt = frozenAt + s.rock;
  return { ...s, freezeAt, frozenAt, rockAt: frozenAt, holdAt, total: holdAt + s.hold };
}

/** Fades in over the first `edge` of 0–1 and out over the last `edge`. */
const window01 = (u: number, edge: number) =>
  Math.min(easeInOutSine(u / edge), easeInOutSine((1 - u) / edge));

/**
 * The dummy's pose `t` seconds into the effect: at rest at 0, frozen from
 * `total` on. The freeze is the heart of it: frost climbs the whole body with
 * a glowing edge, then it stays frozen until the next cast (or a cancel)
 * thaws it. With reduced motion the arms still bind and the frost still
 * climbs, but the body doesn't jolt or rock.
 */
export function petrifyPose(
  plan: PetrifyPlan,
  t: number,
  reducedMotion = false,
): PetrifyPose {
  if (!(t > 0)) return { ...PETRIFY_REST };
  if (t >= plan.total) return { ...PETRIFY_FROZEN };
  const pose: PetrifyPose = { ...PETRIFY_REST };

  // Arms: snap to the sides, then stay clamped.
  pose.armBind = easeOutCubic(progress(t, 0, plan.bind));

  // Frost: climbs during the freeze, then covers the whole body.
  if (t >= plan.freezeAt && t < plan.frozenAt) {
    const u = progress(t, plan.freezeAt, plan.freeze);
    pose.frost = easeInOutSine(u / 0.1);
    pose.frostLine = FROST_BOTTOM + (FROST_TOP - FROST_BOTTOM) * easeInOutSine(u);
    pose.frostRim = window01(u, 0.12);
    pose.chill = easeInOutSine(u);
  } else if (t >= plan.frozenAt) {
    pose.frost = 1;
    pose.frostLine = FROST_TOP;
    pose.chill = 1;
  }

  if (!reducedMotion) {
    // A small backward jolt as the arms clamp.
    if (t < plan.freezeAt)
      pose.tiltX = -BIND_JOLT * Math.sin(Math.PI * progress(t, 0, plan.bind));
    // One stiff rock to a side and back, dying away, with no give in the body.
    if (t >= plan.rockAt && t < plan.holdAt) {
      const u = progress(t, plan.rockAt, plan.rock);
      pose.tiltZ = ROCK_ANGLE * Math.sin(TAU * u) * (1 - u);
    }
  }
  return pose;
}

/* --------------------------------- Leg-lock ------------------------------- */

/** Unscaled segment lengths, in seconds, of a leg-lock, in order. */
export const LEG_LOCK_TIMING = {
  /** Glowing bands spiral up the legs, then pull tight with a snap. */
  bind: 0.6,
  /** Three hops, each smaller, wobbling for balance. */
  hop: 1.8,
  /** It teeters to one side, arms flailing, and rights itself. */
  teeter: 0.8,
  /** It stands still, bands glowing, and stays bound. */
  settle: 0.3,
} as const;

/** Each hop's height in metres, and its share of the hop segment. */
const HOPS = [
  { height: 0.16, share: 0.4 },
  { height: 0.1, share: 0.33 },
  { height: 0.05, share: 0.27 },
] as const;
/** Share of `bind` when the bands have reached the top and start to cinch. */
const BANDS_UP_BY = 0.65;
/** Glow the bands keep while they hold. */
export const BAND_HOLD_GLOW = 0.55;
const HOP_SWAY = 0.07;
const HOP_PITCH = 0.03;
const HOP_FLAIL = 0.3;
const TEETER_ANGLE = 0.13;
const TEETER_FLAIL = 0.4;

export type LegLockSegments = Record<keyof typeof LEG_LOCK_TIMING, number>;

export interface LegLockHop {
  start: number;
  end: number;
  height: number;
}

export interface LegLockPlan extends LegLockSegments {
  hopAt: number;
  hops: readonly LegLockHop[];
  teeterAt: number;
  settleAt: number;
  /** Seconds into the effect when it is still, and stays bound. */
  total: number;
}

export interface LegLockPose {
  /** 0 to 1: how far the bands have spiralled up the legs. */
  bands: number;
  /** 0 loose to 1 pulled tight. */
  cinch: number;
  /** 0 to 1: how brightly the bands glow. */
  bandGlow: number;
  /** Metres hopped off the floor. */
  lift: number;
  /** Radians pitched about the base. */
  tiltX: number;
  /** Radians leaned sideways about the base. */
  tiltZ: number;
  /** Radians the arms flap away from their resting angle. */
  armFlail: number;
}

/** Unbound and still: before a cast, and what cast again or cancel returns to. */
export const LEG_LOCK_REST: Readonly<LegLockPose> = {
  bands: 0,
  cinch: 0,
  bandGlow: 0,
  lift: 0,
  tiltX: 0,
  tiltZ: 0,
  armFlail: 0,
};

/** Legs bound tight, standing still: how a finished leg-lock stays. */
export const LEG_LOCK_BOUND: Readonly<LegLockPose> = {
  bands: 1,
  cinch: 1,
  bandGlow: BAND_HOLD_GLOW,
  lift: 0,
  tiltX: 0,
  tiltZ: 0,
  armFlail: 0,
};

/** Fits a leg-lock into the effect phase; any time left over is spent bound and still. */
export function planLegLock(effectSeconds: number): LegLockPlan {
  const s = fitSegments(LEG_LOCK_TIMING, effectSeconds);
  const hopAt = s.bind;
  let at = hopAt;
  const hops = HOPS.map(({ height, share }) => {
    const hop = { start: at, end: at + s.hop * share, height };
    at = hop.end;
    return hop;
  });
  const teeterAt = hopAt + s.hop;
  const settleAt = teeterAt + s.teeter;
  return { ...s, hopAt, hops, teeterAt, settleAt, total: settleAt + s.settle };
}

/**
 * The dummy's pose `t` seconds into the effect: unbound at 0, bound from
 * `total` on, until the next cast (or a cancel) releases it. With reduced
 * motion the bands still wrap, cinch, and glow, but it doesn't hop, teeter,
 * or flail.
 */
export function legLockPose(
  plan: LegLockPlan,
  t: number,
  reducedMotion = false,
): LegLockPose {
  if (!(t > 0)) return { ...LEG_LOCK_REST };
  if (t >= plan.total) return { ...LEG_LOCK_BOUND };
  const pose: LegLockPose = { ...LEG_LOCK_BOUND };

  // Bands: spiral up, then cinch tight with a flare of light.
  if (t < plan.hopAt) {
    const u = progress(t, 0, plan.bind);
    pose.bands = easeInOutSine(u / BANDS_UP_BY);
    pose.cinch = easeOutCubic((u - BANDS_UP_BY) / (1 - BANDS_UP_BY));
    pose.bandGlow =
      u < BANDS_UP_BY
        ? BAND_HOLD_GLOW * easeInOutSine(u / BANDS_UP_BY)
        : BAND_HOLD_GLOW +
          (1 - BAND_HOLD_GLOW) *
            Math.sin((Math.PI * (u - BANDS_UP_BY)) / (1 - BANDS_UP_BY));
  }
  if (reducedMotion) return pose;

  // Hops: each a small arc with a sway to alternate sides and a flap of the arms.
  plan.hops.forEach((hop, i) => {
    if (t < hop.start || t >= hop.end) return;
    const u = progress(t, hop.start, hop.end - hop.start);
    const arc = Math.sin(Math.PI * u);
    pose.lift = 4 * hop.height * u * (1 - u);
    pose.tiltZ = (i % 2 ? -1 : 1) * HOP_SWAY * arc;
    pose.tiltX = HOP_PITCH * Math.sin(TAU * u);
    pose.armFlail = HOP_FLAIL * Math.sin(TAU * u);
  });

  // Teeter: leans over, nearly goes, and rights itself.
  if (t >= plan.teeterAt && t < plan.settleAt) {
    const u = progress(t, plan.teeterAt, plan.teeter);
    pose.tiltZ = TEETER_ANGLE * Math.sin(1.5 * Math.PI * u) * (1 - u);
    pose.armFlail = TEETER_FLAIL * Math.sin(4 * Math.PI * u) * (1 - u);
  }
  return pose;
}

/* ---------------------------------- Mend ---------------------------------- */

/** Unscaled segment lengths, in seconds, of a mending, in order. */
export const MEND_TIMING = {
  /** The spectacles rise off their case and turn to face the caster. */
  lift: 0.45,
  /** The crack glows from end to end. */
  glow: 0.45,
  /** Fallen shards fly up from the case back into the lens. */
  gather: 0.55,
  /** The crack closes along its length, the lens clears, and a glint crosses it. */
  seal: 0.5,
  /** Rings of light sweep round both frames as they settle back onto the case. */
  ring: 0.6,
  /** Still, mended, and they stay mended. */
  settle: 0.25,
} as const;

/** Metres the spectacles rise off their case. */
export const MEND_LIFT = 0.09;
/** Share of the ring sweep before the spectacles start down. */
const DESCEND_FROM = 0.4;

export type MendSegments = Record<keyof typeof MEND_TIMING, number>;

export interface MendPlan extends MendSegments {
  glowAt: number;
  gatherAt: number;
  sealAt: number;
  ringAt: number;
  settleAt: number;
  /** Seconds into the effect when they are still, and stay mended. */
  total: number;
}

export interface MendPose {
  /** Metres above the case. */
  lift: number;
  /** 0 as they rest, tilted on the case, to 1 turned to face the caster. */
  turn: number;
  /** 0 to 1: how brightly the crack glows. */
  crackGlow: number;
  /** 0 to 1: how far along the crack the glow has travelled. */
  glowReach: number;
  /** 0 lying on the case to 1 back in the lens. */
  shards: number;
  /** 1 cracked to 0 sealed; it closes from one end to the other. */
  crack: number;
  /** 0 hazy and cracked to 1 clear. */
  lensClear: number;
  /** 0 to 1: where the glint is across the lens. */
  glintAt: number;
  /** 0 to 1: how bright the glint is. */
  glint: number;
  /** 0 to 1: how far round the frames the rings of light have swept. */
  ringAt: number;
  /** 0 to 1: how bright the rings are. */
  ring: number;
}

/** Cracked, with shards on the case: before a cast, and what cast again or cancel returns to. */
export const MEND_REST: Readonly<MendPose> = {
  lift: 0,
  turn: 0,
  crackGlow: 0,
  glowReach: 0,
  shards: 0,
  crack: 1,
  lensClear: 0,
  glintAt: 0,
  glint: 0,
  ringAt: 0,
  ring: 0,
};

/** Mended and clear, resting on the case: how a finished mending stays. */
export const MEND_MENDED: Readonly<MendPose> = {
  lift: 0,
  turn: 0,
  crackGlow: 0,
  glowReach: 1,
  shards: 1,
  crack: 0,
  lensClear: 1,
  glintAt: 1,
  glint: 0,
  ringAt: 1,
  ring: 0,
};

/** Fits a mending into the effect phase; any time left over is spent mended. */
export function planMend(effectSeconds: number): MendPlan {
  const s = fitSegments(MEND_TIMING, effectSeconds);
  const glowAt = s.lift;
  const gatherAt = glowAt + s.glow;
  const sealAt = gatherAt + s.gather;
  const ringAt = sealAt + s.seal;
  const settleAt = ringAt + s.ring;
  return { ...s, glowAt, gatherAt, sealAt, ringAt, settleAt, total: settleAt + s.settle };
}

/**
 * The spectacles' pose `t` seconds into the effect: cracked at 0, mended from
 * `total` on, until the next cast (or a cancel) cracks them again. With
 * reduced motion the crack still glows and seals and the lens clears, but they
 * don't lift or turn; the performer fades the shards in place instead of
 * flying them.
 */
export function mendPose(plan: MendPlan, t: number, reducedMotion = false): MendPose {
  if (!(t > 0)) return { ...MEND_REST };
  if (t >= plan.total) return { ...MEND_MENDED };
  const pose: MendPose = { ...MEND_REST };

  // Lift and turn to face the caster; hold; drift back down during the ring sweep.
  if (!reducedMotion) {
    let up: number;
    if (t < plan.glowAt) up = easeInOutSine(progress(t, 0, plan.lift));
    else if (t < plan.ringAt) up = 1;
    else {
      const u = progress(t, plan.ringAt, plan.ring);
      up = 1 - easeInOutSine((u - DESCEND_FROM) / (1 - DESCEND_FROM));
    }
    pose.lift = MEND_LIFT * up;
    pose.turn = up;
  }

  // The glow runs along the crack, stays lit, and fades as the crack closes.
  if (t >= plan.glowAt) {
    const u = progress(t, plan.glowAt, plan.glow);
    pose.glowReach = easeInOutSine(u);
    const fadeIn = easeInOutSine(u / 0.2);
    const fadeOut = 1 - easeInOutSine((progress(t, plan.sealAt, plan.seal) - 0.7) / 0.3);
    pose.crackGlow = Math.min(fadeIn, fadeOut);
  }

  if (t >= plan.gatherAt)
    pose.shards = easeInOutCubic(progress(t, plan.gatherAt, plan.gather));

  if (t >= plan.sealAt) {
    const u = progress(t, plan.sealAt, plan.seal);
    pose.crack = 1 - easeInOutSine(u);
    pose.lensClear = easeInOutSine(u);
    pose.glintAt = u;
    pose.glint = Math.sin(Math.PI * u);
  }

  if (t >= plan.ringAt) {
    const u = progress(t, plan.ringAt, plan.ring);
    pose.ringAt = easeInOutSine(u);
    pose.ring = Math.sin(Math.PI * u);
  }
  return pose;
}

/* -------------------------------- Sunburst -------------------------------- */

/** Unscaled segment lengths, in seconds, of a sunburst, in order. */
export const SUNBURST_TIMING = {
  /** A blaze of sunlight blooms over the vines, rays spreading. */
  flare: 0.5,
  /** The vines flinch away from the light, shivering, leaves fluttering. */
  recoil: 0.8,
  /** They shrink back into the pot from their tips; leaves close and fall in. */
  retreat: 1.5,
  /** The sunlight softens to a warm glow over the pot, and they stay withered back. */
  fade: 0.7,
} as const;

/** Share of the flare after which the vines start to flinch: they react while it is still blooming. */
const RECOIL_FROM = 0.4;
/** How much of each vine is left above the soil once it has withered back, 0 to 1. */
export const VINE_STUB = 0.14;
/** Brightness the sunlight keeps as it lingers over the pot. */
export const SUN_GLOW = 0.2;
/** Brightness as the vines finish retreating, before it softens to the glow. */
const SUN_WANE = 0.55;

export type SunburstSegments = Record<keyof typeof SUNBURST_TIMING, number>;

export interface SunburstPlan extends SunburstSegments {
  recoilAt: number;
  retreatAt: number;
  fadeAt: number;
  /** Seconds into the effect when the light has softened, and the vines stay withered back. */
  total: number;
}

export interface SunburstPose {
  /** 0 to 1: how bright the sunlight is, before the data's intensity. */
  sun: number;
  /** 0 to 1: how far the sun's rays reach. */
  rays: number;
  /** 0 upright to 1 leaning and curling away from the light. */
  recoil: number;
  /** 0 to 1: how hard the vines shiver and their leaves flutter. */
  shiver: number;
  /** 1 full height to `VINE_STUB`: how much of each vine shows above the soil. */
  reach: number;
}

/** Full grown and unlit: before a cast, and what cast again or cancel returns to. */
export const SUNBURST_REST: Readonly<SunburstPose> = {
  sun: 0,
  rays: 0,
  recoil: 0,
  shiver: 0,
  reach: 1,
};

/** Withered back to stubs under a warm glow: how a finished sunburst stays. */
export const SUNBURST_WITHERED: Readonly<SunburstPose> = {
  sun: SUN_GLOW,
  rays: 0,
  recoil: 0,
  shiver: 0,
  reach: VINE_STUB,
};

/** Fits a sunburst into the effect phase; any time left over is spent withered back. */
export function planSunburst(effectSeconds: number): SunburstPlan {
  const s = fitSegments(SUNBURST_TIMING, effectSeconds);
  const recoilAt = s.flare * RECOIL_FROM;
  const retreatAt = s.flare + s.recoil;
  const fadeAt = retreatAt + s.retreat;
  return { ...s, recoilAt, retreatAt, fadeAt, total: fadeAt + s.fade };
}

/** 0 to 1: how withered back the vines are, from their pose's `reach`. */
export const witheredAmount = (pose: Pick<SunburstPose, "reach">) =>
  clamp01((1 - pose.reach) / (1 - VINE_STUB));

/**
 * The vines and the sunlight `t` seconds into the effect: grown and unlit at
 * 0, withered back under a warm glow from `total` on, until the next cast (or
 * a cancel) grows them back. With reduced motion the light still flares and
 * the vines still retreat, but they don't lean, shiver, or flutter.
 */
export function sunburstPose(
  plan: SunburstPlan,
  t: number,
  reducedMotion = false,
): SunburstPose {
  if (!(t > 0)) return { ...SUNBURST_REST };
  if (t >= plan.total) return { ...SUNBURST_WITHERED };
  const pose: SunburstPose = { ...SUNBURST_REST };

  // Sunlight: blooms, blazes while they recoil, wanes as they retreat, softens to a glow.
  if (t < plan.retreatAt) {
    pose.sun = easeOutCubic(progress(t, 0, plan.flare));
    pose.rays = pose.sun;
  } else if (t < plan.fadeAt) {
    const k = easeInOutSine(progress(t, plan.retreatAt, plan.retreat));
    pose.sun = 1 + (SUN_WANE - 1) * k;
    pose.rays = 1 - k;
  } else {
    const k = easeInOutSine(progress(t, plan.fadeAt, plan.fade));
    pose.sun = SUN_WANE + (SUN_GLOW - SUN_WANE) * k;
    pose.rays = 0;
  }

  // Vines: shrink back from their tips once the recoil has run its course.
  if (t >= plan.retreatAt) {
    pose.reach =
      1 + (VINE_STUB - 1) * easeInOutCubic(progress(t, plan.retreatAt, plan.retreat));
  }

  if (!reducedMotion) {
    const recoilLength = plan.retreatAt - plan.recoilAt;
    if (t >= plan.recoilAt && t < plan.retreatAt) {
      const u = progress(t, plan.recoilAt, recoilLength);
      pose.recoil = easeOutCubic(u / 0.45);
      pose.shiver = easeInOutSine(u / 0.2);
    } else if (t >= plan.retreatAt) {
      // They straighten as they draw in, and the shiver dies away.
      const k = progress(t, plan.retreatAt, plan.retreat);
      pose.recoil = 1 - easeInOutSine(k);
      pose.shiver = 1 - easeInOutSine(k / 0.7);
    }
  }
  return pose;
}

/* --------------------------------- Ignite --------------------------------- */

type Ignite = Extract<SpellOutcome, { kind: "ignite" }>;

/** Unscaled segment lengths, in seconds, around the data's `flameSeconds`. */
export const IGNITE_TIMING = {
  /** A flame catches at the hem and takes hold. */
  catch: 0.4,
  /** The flames die down and go out, and smoke curls up. */
  die: 0.5,
  /** Still, charred and smouldering, and it stays that way. */
  settle: 0.2,
} as const;

/** World heights of the cloak's hem and of the top of its hood. */
export const CLOAK_HEM = 0.38;
export const CLOAK_TOP = 1.86;
/** How high the hem has burnt away once the fire is out. */
export const HEM_BURNT = 0.62;
/** How high the flames have climbed once they have taken hold. */
const CATCH_CLIMB = 0.14;
/** Glow the embers keep as it smoulders. */
export const EMBER_HOLD = 0.4;

export interface IgnitePlan {
  catch: number;
  burn: number;
  die: number;
  settle: number;
  burnAt: number;
  dieAt: number;
  settleAt: number;
  /** Seconds into the effect when it is out, and stays charred and smouldering. */
  total: number;
}

export interface IgnitePose {
  /** World height the flames have climbed to: everything below it is charred. */
  front: number;
  /** 0 to 1: how fiercely it burns. */
  flame: number;
  /** 0 to 1: how the flames and firelight flicker. */
  flicker: number;
  /** 0 to 1: how dark the charred cloth is. */
  char: number;
  /** World height the hem has burnt away to. */
  eaten: number;
  /** 0 to 1: how brightly the embers along the burnt edge glow. */
  embers: number;
}

/** Whole and unburnt: before a cast, and what cast again or cancel returns to. */
export const IGNITE_REST: Readonly<IgnitePose> = {
  front: CLOAK_HEM,
  flame: 0,
  flicker: 0,
  char: 0,
  eaten: CLOAK_HEM - 0.1,
  embers: 0,
};

/** Out, charred to the top, the hem burnt away and smouldering: how a finished ignite stays. */
export const IGNITE_BURNT: Readonly<IgnitePose> = {
  front: CLOAK_TOP,
  flame: 0,
  flicker: 0,
  char: 1,
  eaten: HEM_BURNT,
  embers: EMBER_HOLD,
};

/**
 * Fits a burn into the effect phase. Segments keep their natural lengths when
 * there is room and shrink proportionally when there isn't; any time left
 * over is spent smouldering.
 */
export function planIgnite(outcome: Ignite, effectSeconds: number): IgnitePlan {
  const s = fitSegments({ ...IGNITE_TIMING, burn: outcome.flameSeconds }, effectSeconds);
  const burnAt = s.catch;
  const dieAt = burnAt + s.burn;
  const settleAt = dieAt + s.die;
  return {
    catch: s.catch,
    burn: s.burn,
    die: s.die,
    settle: s.settle,
    burnAt,
    dieAt,
    settleAt,
    total: settleAt + s.settle,
  };
}

/** 0 to 1: how burnt the cloak is, from its pose's `eaten` hem. */
export const burntAmount = (pose: Pick<IgnitePose, "eaten">) =>
  clamp01((pose.eaten - IGNITE_REST.eaten) / (HEM_BURNT - IGNITE_REST.eaten));

/**
 * The cloak `t` seconds into the effect: whole at 0, charred and smouldering
 * from `total` on, until the next cast (or a cancel) restores it. With reduced
 * motion the flames still climb and char it, but nothing flickers.
 */
export function ignitePose(
  plan: IgnitePlan,
  t: number,
  reducedMotion = false,
): IgnitePose {
  if (!(t > 0)) return { ...IGNITE_REST };
  if (t >= plan.total) return { ...IGNITE_BURNT };
  const pose: IgnitePose = { ...IGNITE_REST };
  const caught = CLOAK_HEM + CATCH_CLIMB;

  if (t < plan.burnAt) {
    // Catch: a flame kindles at the hem and takes hold.
    const u = progress(t, 0, plan.catch);
    pose.flame = 0.6 * easeOutCubic(u);
    pose.front = CLOAK_HEM + CATCH_CLIMB * easeInOutSine(u);
    pose.char = easeInOutSine(u);
    pose.embers = easeInOutSine(u);
  } else if (t < plan.dieAt) {
    // Burn: the flames climb to the top, eating the hem away behind them.
    const u = progress(t, plan.burnAt, plan.burn);
    pose.flame = 0.6 + 0.4 * easeInOutSine(u / 0.25);
    pose.front = caught + (CLOAK_TOP - caught) * easeInOutSine(u);
    pose.char = 1;
    pose.eaten = IGNITE_REST.eaten + (HEM_BURNT - IGNITE_REST.eaten) * easeInOutSine(u);
    pose.embers = 1;
  } else {
    // Die down, then settle: the flames go out and the embers dim to a smoulder.
    const u = progress(t, plan.dieAt, plan.die);
    pose.flame = 1 - easeInOutSine(u);
    pose.front = CLOAK_TOP;
    pose.char = 1;
    pose.eaten = HEM_BURNT;
    pose.embers = 1 + (EMBER_HOLD - 1) * easeInOutSine(u);
  }

  pose.flicker = reducedMotion ? 0 : pose.flame;
  return pose;
}

/**
 * Seconds into the effect phase when the outcome starts winding down: the
 * room settles, the camera eases back, and the spell light fades from here.
 */
export function outcomeReleaseAt(outcome: SpellOutcome, effectSeconds: number): number {
  if (outcome.kind === "levitate") {
    const plan = planLevitation(outcome, effectSeconds);
    return plan.rise + plan.hover;
  }
  // The door stays open, but the room and camera settle once it has swung open.
  if (outcome.kind === "unlock") return planUnlock(effectSeconds).openEnd;
  // The dummy stays frozen, but the room and camera settle once its rock has died away.
  if (outcome.kind === "petrify") return planPetrify(effectSeconds).holdAt;
  // The legs stay bound, but the room and camera settle once it has stopped teetering.
  if (outcome.kind === "leg-lock") return planLegLock(effectSeconds).settleAt;
  // The spectacles stay mended, but the room and camera settle as the rings sweep round.
  if (outcome.kind === "mend") return planMend(effectSeconds).ringAt;
  // The vines stay withered back, but the room and camera settle as they draw in and the light wanes.
  if (outcome.kind === "sunburst") {
    const plan = planSunburst(effectSeconds);
    return plan.retreatAt + plan.retreat * 0.4;
  }
  // The cloak stays charred, but the firelight and camera settle as the flames die down.
  if (outcome.kind === "ignite") return planIgnite(outcome, effectSeconds).dieAt;
  return effectSeconds * 0.4;
}

/**
 * Named moments an outcome can sound. `sustain` and `finish` play the spell's
 * `sound.ambient` and `sound.settle`; the rest play `sound.moments[moment]`.
 */
export type OutcomeMoment = "sustain" | "finish" | OutcomeSoundMoment;

export interface OutcomeSoundEvent {
  moment: OutcomeMoment;
  /** Seconds into the effect phase. */
  at: number;
  /** For sustained sounds, how long they last. */
  duration?: number;
}

/** When outcome sounds play within the effect phase. Outcomes without their own sounds return none. */
export function outcomeSoundEvents(
  outcome: SpellOutcome,
  effectSeconds: number,
): OutcomeSoundEvent[] {
  if (effectSeconds <= 0) return [];
  if (outcome.kind === "levitate") {
    const plan = planLevitation(outcome, effectSeconds);
    return [
      { moment: "sustain", at: 0, duration: plan.landAt },
      { moment: "finish", at: plan.landAt },
    ];
  }
  if (outcome.kind === "unlock") {
    const plan = planUnlock(effectSeconds);
    return [
      { moment: "ward-break", at: 0 },
      { moment: "unlatch", at: plan.unlatchAt },
      { moment: "swing-open", at: plan.openAt, duration: plan.open },
    ];
  }
  if (outcome.kind === "petrify") {
    const plan = planPetrify(effectSeconds);
    return [
      { moment: "bind", at: 0 },
      { moment: "freeze", at: plan.freezeAt, duration: plan.freeze },
      { moment: "rock", at: plan.rockAt + plan.rock * 0.25 },
    ];
  }
  if (outcome.kind === "leg-lock") {
    const plan = planLegLock(effectSeconds);
    return [
      { moment: "bands", at: 0, duration: plan.bind * BANDS_UP_BY },
      { moment: "cinch", at: plan.bind * BANDS_UP_BY },
      ...plan.hops.map((hop) => ({ moment: "hop" as const, at: hop.end })),
      { moment: "teeter", at: plan.teeterAt, duration: plan.teeter },
    ];
  }
  if (outcome.kind === "mend") {
    const plan = planMend(effectSeconds);
    return [
      { moment: "crack-glow", at: plan.glowAt, duration: plan.glow },
      { moment: "shards", at: plan.gatherAt, duration: plan.gather },
      { moment: "seal", at: plan.sealAt },
      { moment: "ring", at: plan.ringAt },
    ];
  }
  if (outcome.kind === "sunburst") {
    const plan = planSunburst(effectSeconds);
    return [
      { moment: "flare", at: 0, duration: plan.retreatAt },
      { moment: "recoil", at: plan.recoilAt, duration: plan.retreatAt - plan.recoilAt },
      { moment: "retreat", at: plan.retreatAt, duration: plan.retreat },
    ];
  }
  if (outcome.kind === "ignite") {
    const plan = planIgnite(outcome, effectSeconds);
    return [
      { moment: "kindle", at: 0 },
      {
        moment: "blaze",
        at: plan.burnAt * 0.5,
        duration: plan.dieAt - plan.burnAt * 0.5,
      },
      { moment: "douse", at: plan.dieAt },
    ];
  }
  return [];
}
