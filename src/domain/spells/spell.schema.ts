import { z } from "zod";
import { SPELL_CATEGORY_IDS } from "@/config/categories";

/*
 * The spell domain model.
 *
 * Schemas are the single source of truth: TypeScript types are inferred from
 * them, and every dataset is validated against them in tests. Dataset modules
 * import only the *types*, so Zod never ships to the client for static data.
 *
 * Every visual/audio field describes WHAT should happen, never HOW. The 3D
 * layer decides how a "levitate" outcome or a "sparkles" preset is rendered,
 * which keeps spell data renderer-agnostic and content packs swappable.
 */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case slug");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour");
const seconds = z.number().nonnegative();
const unitInterval = z.number().min(0).max(1);

/* ---------------------------------- Source --------------------------------- */

/** Where a spell appears. A spell can be book-only, film-only, or both. */
export const spellAppearanceSchema = z.discriminatedUnion("medium", [
  z.object({
    medium: z.literal("book"),
    workId: slug,
    chapter: z.number().int().positive(),
  }),
  z.object({
    medium: z.literal("film"),
    workId: slug,
  }),
]);

/* ------------------------------- Wand motion ------------------------------- */

export const WAND_MOTION_PRESETS = [
  "flick",
  "swish",
  "swish-and-flick",
  "circle",
  "upward",
  "downward",
  "jab",
  "twist",
] as const;

const easing = z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "snap"]);

/** A point in wand-gesture space: x/y in [-1, 1], screen-aligned, +y up. */
const gesturePoint = z.object({
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1).optional(),
});

export const wandMotionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(WAND_MOTION_PRESETS),
    duration: seconds,
    easing: easing.optional(),
  }),
  z.object({
    type: z.literal("custom"),
    points: z.array(gesturePoint).min(2),
    /** How to perform it, in one plain sentence ending with a full stop. */
    description: z.string().min(1).max(120).optional(),
    duration: seconds,
    easing: easing.optional(),
  }),
]);

/* ------------------------------ Cast timeline ------------------------------ */

/**
 * Per-spell timing, in seconds, for each phase of the cast state machine.
 * A phase with duration 0 is passed through instantly (e.g. no projectile).
 */
export const castTimelineSchema = z.object({
  preparing: seconds,
  casting: seconds,
  projectile: seconds,
  impact: seconds,
  effect: seconds,
});

/* --------------------------------- Visuals --------------------------------- */

export const PARTICLE_PRESETS = [
  "sparkles",
  "dust",
  "energy",
  "smoke",
  "embers",
  "magic-trail",
  "impact-burst",
] as const;

export const PROJECTILE_KINDS = [
  "energy-beam",
  "magic-orb",
  "spark",
  "ray",
  "wave",
  "burst",
  "aura",
] as const;

export const projectileSchema = z.object({
  kind: z.enum(PROJECTILE_KINDS),
  size: z.number().positive(),
  trail: z.boolean(),
  glow: unitInterval,
});

/** What happens to the target. Discriminated so each outcome carries only its own knobs. */
export const spellOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("levitate"),
    liftHeight: z.number().positive(),
    hoverSeconds: seconds,
    spinTurns: z.number().nonnegative(),
  }),
  z.object({ kind: z.literal("unlock") }),
  z.object({ kind: z.literal("petrify") }),
  z.object({ kind: z.literal("leg-lock") }),
  z.object({ kind: z.literal("mend") }),
  z.object({
    kind: z.literal("sunburst"),
    intensity: unitInterval,
  }),
  z.object({
    kind: z.literal("ignite"),
    flameSeconds: seconds,
  }),
]);

export const visualEffectSchema = z.object({
  palette: z.object({ core: hexColor, glow: hexColor }),
  projectile: projectileSchema.nullable(),
  particles: z.array(z.enum(PARTICLE_PRESETS)),
  outcome: spellOutcomeSchema,
});

/* ------------------------------ Environment -------------------------------- */

export const ENVIRONMENT_REACTIONS = [
  "candle-flicker",
  "dust-rise",
  "chamber-brighten",
  "chamber-dim",
  "tremor",
] as const;

export const environmentReactionSchema = z.object({
  kind: z.enum(ENVIRONMENT_REACTIONS),
  intensity: unitInterval,
});

/* ---------------------------------- Target --------------------------------- */

/** Original props placed on the chamber pedestal. Never ripped or film-accurate models. */
export const TARGET_MODELS = [
  "tome",
  "warded-door",
  "practice-mannequin",
  "cracked-spectacles",
  "creeping-vines",
  "cloak-stand",
] as const;

export const targetSchema = z.object({
  model: z.enum(TARGET_MODELS),
});

/* ---------------------------------- Audio ---------------------------------- */

/** Audio is referenced by cue id; the audio manifest maps ids to licensed files. */
const audioCueId = slug;

/** Moments inside an outcome that can have their own sound, e.g. a door's creak. */
export const OUTCOME_SOUND_MOMENTS = [
  // Unlock
  "ward-break",
  "unlatch",
  "swing-open",
  // Petrify
  "bind",
  "freeze",
  "rock",
  // Leg-lock
  "bands",
  "cinch",
  "hop",
  "teeter",
  // Mend
  "crack-glow",
  "shards",
  "seal",
  "ring",
  // Sunburst
  "flare",
  "recoil",
  "retreat",
  // Ignite
  "kindle",
  "blaze",
  "douse",
] as const;

export const spellSoundSchema = z.object({
  charge: audioCueId.optional(),
  cast: audioCueId.optional(),
  impact: audioCueId.optional(),
  /** While the outcome holds, e.g. an object floating. */
  ambient: audioCueId.optional(),
  /** As the outcome finishes, e.g. an object landing. */
  settle: audioCueId.optional(),
  /** The outcome's own moments. A moment without a cue here stays silent. */
  moments: z.partialRecord(z.enum(OUTCOME_SOUND_MOMENTS), audioCueId).optional(),
});

/* ---------------------------------- Spell ---------------------------------- */

export const spellDefinitionSchema = z.object({
  id: slug,
  /** Common name, e.g. "Levitation Charm". */
  name: z.string().min(1),
  /** The spoken words. Also what voice casting will match against. */
  incantation: z.string().min(1),
  pronunciation: z.string().min(1).optional(),
  /** One line for cards and meta descriptions. Original wording, never quoted text. */
  summary: z.string().min(1).max(140),
  /** A short original explanation shown on the detail page. */
  description: z.string().min(1).max(600),
  category: z.enum(SPELL_CATEGORY_IDS),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  appearances: z.array(spellAppearanceSchema).min(1),
  /** Editorial notes: spelling variants, film/book differences, liberties taken. */
  notes: z.string().min(1).optional(),
  wandMotion: wandMotionSchema,
  timeline: castTimelineSchema,
  visualEffect: visualEffectSchema,
  environmentEffects: z.array(environmentReactionSchema),
  sound: spellSoundSchema.optional(),
  target: targetSchema,
});

export type SpellAppearance = z.infer<typeof spellAppearanceSchema>;
export type WandMotionDefinition = z.infer<typeof wandMotionSchema>;
export type WandMotionPreset = (typeof WAND_MOTION_PRESETS)[number];
export type CastTimeline = z.infer<typeof castTimelineSchema>;
export type ParticlePreset = (typeof PARTICLE_PRESETS)[number];
export type ProjectileDefinition = z.infer<typeof projectileSchema>;
export type SpellOutcome = z.infer<typeof spellOutcomeSchema>;
export type SpellEffectDefinition = z.infer<typeof visualEffectSchema>;
export type EnvironmentReactionDefinition = z.infer<typeof environmentReactionSchema>;
export type TargetDefinition = z.infer<typeof targetSchema>;
export type TargetModel = (typeof TARGET_MODELS)[number];
export type SoundDefinition = z.infer<typeof spellSoundSchema>;
export type OutcomeSoundMoment = (typeof OUTCOME_SOUND_MOMENTS)[number];
export type SpellDefinition = z.infer<typeof spellDefinitionSchema>;
export type SpellDifficulty = SpellDefinition["difficulty"];
