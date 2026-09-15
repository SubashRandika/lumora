import { describe, expect, it } from "vitest";
import { allSpells } from "@/data/spells";
import {
  AUDIO_CUES,
  DEFAULT_CUES,
  effectiveVolume,
  isAudioCueId,
  resolveCue,
} from "./cues";

describe("audio cues", () => {
  it("has a recipe for every cue a spell names", () => {
    for (const spell of allSpells) {
      const { moments, ...phases } = spell.sound ?? {};
      for (const [moment, id] of Object.entries({ ...phases, ...moments })) {
        expect(isAudioCueId(id), `${spell.id}.sound.${moment} = "${id}"`).toBe(true);
      }
    }
  });

  it("keeps every layer's gain gentle enough to stack without clipping", () => {
    // The bus compressor catches brief peaks; this keeps it from pumping.
    for (const [id, recipe] of Object.entries(AUDIO_CUES)) {
      const total = recipe.reduce((sum, layer) => sum + layer.gain, 0);
      expect(total, id).toBeLessThanOrEqual(0.8);
    }
  });

  it("falls back to the default cue for a moment", () => {
    expect(resolveCue(undefined, "cast")).toBe(AUDIO_CUES[DEFAULT_CUES.cast]);
    expect(resolveCue("no-such-cue", "impact")).toBe(AUDIO_CUES[DEFAULT_CUES.impact]);
    expect(resolveCue("cast-click", "cast")).toBe(AUDIO_CUES["cast-click"]);
  });

  it("silences sound when disabled and curves the volume slider", () => {
    expect(effectiveVolume(false, 1)).toBe(0);
    expect(effectiveVolume(true, 1)).toBe(1);
    expect(effectiveVolume(true, 0.5)).toBe(0.25);
    expect(effectiveVolume(true, 3)).toBe(1);
  });
});
