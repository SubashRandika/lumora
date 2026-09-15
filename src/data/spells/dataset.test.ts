import { describe, expect, it } from "vitest";
import { spellDefinitionSchema } from "@/domain/spells/spell.schema";
import { workSchema } from "@/domain/spells/work.schema";
import { totalCastDuration } from "@/domain/casting/castMachine";
import { allSpells } from "./index";
import { works } from "../works";

describe("content pack", () => {
  it.each(works.map((w) => [w.id, w] as const))(
    "work %s matches the schema",
    (_, work) => {
      expect(() => workSchema.parse(work)).not.toThrow();
    },
  );

  it.each(allSpells.map((s) => [s.id, s] as const))(
    "spell %s matches the schema",
    (_, spell) => {
      const result = spellDefinitionSchema.safeParse(spell);
      expect(result.success, result.error?.message).toBe(true);
    },
  );

  it("includes the Philosopher's Stone incantations", () => {
    expect(allSpells.map((s) => s.id).sort()).toEqual(
      [
        "alohomora",
        "lacarnum-inflamari",
        "locomotor-mortis",
        "lumos-solem",
        "oculus-reparo",
        "petrificus-totalus",
        "wingardium-leviosa",
      ].sort(),
    );
  });

  it("explains every single-medium appearance with a note", () => {
    for (const spell of allSpells) {
      const media = new Set(spell.appearances.map((a) => a.medium));
      if (media.size === 1) expect(spell.notes, spell.id).toBeTruthy();
    }
  });

  it("keeps every cast short enough to stay responsive", () => {
    for (const spell of allSpells) {
      expect(totalCastDuration(spell.timeline), spell.id).toBeLessThanOrEqual(10);
      expect(spell.timeline.casting, spell.id).toBeGreaterThan(0);
    }
  });

  it("gives a projectile phase time only to spells that have a projectile", () => {
    for (const spell of allSpells) {
      if (spell.visualEffect.projectile === null) {
        expect(spell.timeline.projectile, spell.id).toBe(0);
      }
    }
  });
});
