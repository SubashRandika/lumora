import { describe, expect, it } from "vitest";
import { allSpells } from "@/data/spells";
import { VOICE } from "@/config/voice";
import {
  matchIncantation,
  phoneticKey,
  scoreSpoken,
  similarity,
} from "./incantationMatch";

const spells = allSpells.map(({ id, incantation }) => ({ id, incantation }));
const heard = (...transcripts: string[]) => matchIncantation(transcripts, spells);
const cast = (...transcripts: string[]) => {
  const match = heard(...transcripts);
  return match && match.score >= VOICE.matchThreshold ? match.spellId : null;
};

describe("incantation matching", () => {
  it("casts on the incantation said plainly", () => {
    for (const spell of spells) {
      expect(cast(spell.incantation), spell.incantation).toBe(spell.id);
    }
  });

  it("casts through the mishearings a recogniser actually returns", () => {
    expect(cast("aloha mora")).toBe("alohomora");
    expect(cast("alohamora")).toBe("alohomora");
    expect(cast("win gardium levi osa")).toBe("wingardium-leviosa");
    expect(cast("wingardian leviosa")).toBe("wingardium-leviosa");
    expect(cast("petrificus totalis")).toBe("petrificus-totalus");
    expect(cast("locomotor mortis")).toBe("locomotor-mortis");
    expect(cast("oculus reparo")).toBe("oculus-reparo");
    expect(cast("lumos solem")).toBe("lumos-solem");
    expect(cast("lacarnum inflamari")).toBe("lacarnum-inflamari");
  });

  it("ignores the words around the incantation", () => {
    expect(cast("cast alohomora")).toBe("alohomora");
    expect(cast("um, wingardium leviosa please")).toBe("wingardium-leviosa");
  });

  it("takes the best of the recogniser's alternatives", () => {
    expect(cast("a low more a", "alohomora")).toBe("alohomora");
  });

  it("refuses anything that isn't close enough to a spell", () => {
    for (const phrase of [
      "hello there",
      "what time is it",
      "expelliarmus",
      "avada kedavra",
      "cast a spell",
      "",
    ]) {
      expect(cast(phrase), phrase).toBeNull();
    }
  });

  it("refuses half an incantation", () => {
    // "Leviosa" alone is most of the fun but only half the spell.
    expect(cast("leviosa")).toBeNull();
    expect(cast("lumos")).toBeNull();
  });

  it("never confuses one spell for another", () => {
    for (const spell of spells) {
      const match = heard(spell.incantation);
      expect(match?.spellId, spell.incantation).toBe(spell.id);
      expect(match?.score).toBeCloseTo(1);
    }
  });

  it("reports what it heard so the caster can be told", () => {
    const match = heard("please cast alohamora now");
    expect(match?.heard).toBe("alohamora");
    expect(match?.score).toBeGreaterThan(VOICE.matchThreshold);
  });

  it("returns nothing when there was nothing to hear", () => {
    expect(heard()).toBeNull();
    expect(heard("   ")).toBeNull();
  });

  it("scores spelling and sound, whichever is kinder", () => {
    expect(scoreSpoken("alohomora", "Alohomora")).toBe(1);
    // Spelled differently, sounds the same.
    expect(similarity("totalus", "totalis")).toBeLessThan(1);
    expect(phoneticKey("totalus")).toBe(phoneticKey("totalis"));
    expect(phoneticKey("Wingardium")).toBe(phoneticKey("vingardeum"));
  });
});
