/**
 * Spell categories are configuration, not code. Add, rename, or reorder
 * entries here; the schema, filters, and badges all derive from this list.
 */
export const SPELL_CATEGORY_IDS = [
  "charms",
  "curses",
  "transfiguration",
  "defensive",
  "healing",
  "utility",
  "dark-arts",
  "other",
] as const;

export type SpellCategoryId = (typeof SPELL_CATEGORY_IDS)[number];

export interface SpellCategoryConfig {
  label: string;
  description: string;
}

export const SPELL_CATEGORIES: Record<SpellCategoryId, SpellCategoryConfig> = {
  charms: {
    label: "Charms",
    description: "Change what an object does or how it behaves.",
  },
  curses: {
    label: "Curses & Jinxes",
    description: "Hinder or restrain a target. Not necessarily dark magic.",
  },
  transfiguration: {
    label: "Transfiguration",
    description: "Change what an object is.",
  },
  defensive: {
    label: "Defensive",
    description: "Shield, deflect, or disarm.",
  },
  healing: {
    label: "Healing",
    description: "Mend injuries and restore the body.",
  },
  utility: {
    label: "Utility",
    description: "Everyday household and practical magic.",
  },
  "dark-arts": {
    label: "Dark Arts",
    description: "Magic intended to harm or dominate.",
  },
  other: {
    label: "Other",
    description: "Magic that doesn't fit a single discipline.",
  },
};
