import { normalizeIncantation } from "@/domain/spells/registry";

/*
 * Matching a spoken phrase to an incantation.
 *
 * Speech recognisers are trained on English, and these words are invented
 * Latin, so transcripts come back bruised: "alohomora" as "aloha mora",
 * "petrificus totalus" as "petrificus totalis". Two passes catch most of it:
 * how the words are spelled, and how they sound. The better of the two wins,
 * and anything at or above the caller's threshold is treated as the spell.
 *
 * Pure functions: no recogniser, no DOM. The browser side lives in
 * src/features/spell-casting/voice.
 */

/** Longest transcript considered, in words. Anything more is background talk. */
const MAX_WORDS = 16;

/** Sound-alike substitutions, applied in order. */
const SOUNDS: readonly (readonly [RegExp, string])[] = [
  [/ph/g, "f"],
  [/th/g, "t"],
  [/ck/g, "k"],
  [/[cq]/g, "k"],
  [/x/g, "ks"],
  [/z/g, "s"],
  // An English speaker's "w" and a recogniser's "v" are the same wand motion.
  [/w/g, "v"],
  [/y/g, "i"],
  // "h" is audible at the start of a word and little more than breath inside one.
  [/(?<=.)h/g, ""],
  // Vowel colour is the first thing a listener loses: treat them as one sound.
  [/[aeiou]/g, "a"],
];

/**
 * A spelling-independent key for how a phrase sounds, so "totalus" and
 * "totalis" collapse to the same thing.
 */
export function phoneticKey(text: string): string {
  let key = normalizeIncantation(text);
  for (const [pattern, replacement] of SOUNDS) key = key.replace(pattern, replacement);
  // A doubled letter is one sound: "totallus" is "totalus".
  return key.replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length]!;
}

/** How alike two strings are, from 0 (nothing in common) to 1 (identical). */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/** How well a spoken phrase matches one incantation, by spelling or by sound. */
export function scoreSpoken(spoken: string, incantation: string): number {
  const said = normalizeIncantation(spoken);
  if (!said) return 0;
  return Math.max(
    similarity(said, normalizeIncantation(incantation)),
    similarity(phoneticKey(spoken), phoneticKey(incantation)),
  );
}

export interface SpokenSpell {
  id: string;
  incantation: string;
}

export interface IncantationMatch {
  spellId: string;
  /** 0–1. Compare against your threshold; the match is simply the closest spell. */
  score: number;
  /** The words that matched, as they were heard. Show this back to the caster. */
  heard: string;
}

/**
 * The closest spell across every transcript the recogniser offered, or null if
 * there was nothing to go on. People say more than the words ("cast alohomora",
 * "er, wingardium leviosa"), so every run of words is scored and the best wins.
 */
export function matchIncantation(
  transcripts: readonly string[],
  spells: readonly SpokenSpell[],
): IncantationMatch | null {
  let best: IncantationMatch | null = null;

  for (const transcript of transcripts) {
    const words = normalizeIncantation(transcript).split(" ").filter(Boolean);
    if (!words.length) continue;
    const limited = words.slice(0, MAX_WORDS);

    for (let from = 0; from < limited.length; from++) {
      for (let to = from + 1; to <= limited.length; to++) {
        const heard = limited.slice(from, to).join(" ");
        for (const spell of spells) {
          const score = scoreSpoken(heard, spell.incantation);
          if (!best || score > best.score) best = { spellId: spell.id, score, heard };
        }
      }
    }
  }

  return best;
}
