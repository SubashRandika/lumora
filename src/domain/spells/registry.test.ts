import { describe, expect, it } from "vitest";
import { spellRegistry } from "@/data/registry";
import { philosophersStoneSpells } from "@/data/spells/philosophers-stone";
import { works } from "@/data/works";
import {
  createSpellRegistry,
  normalizeIncantation,
  SpellRegistryError,
} from "./registry";
import type { SpellDefinition } from "./spell.schema";
import type { Work } from "./work.schema";

const leviosa = philosophersStoneSpells.find((s) => s.id === "wingardium-leviosa")!;

describe("spellRegistry", () => {
  it("looks up spells by id", () => {
    expect(spellRegistry.getById("wingardium-leviosa")?.incantation).toBe(
      "Wingardium Leviosa",
    );
    expect(spellRegistry.getById("avada-kedavra")).toBeUndefined();
  });

  it("filters by work", () => {
    expect(spellRegistry.getByWork("philosophers-stone")).toHaveLength(
      philosophersStoneSpells.length,
    );
    expect(spellRegistry.getByWork("chamber-of-secrets")).toEqual([]);
  });

  it("filters by category", () => {
    const curses = spellRegistry.getByCategory("curses").map((s) => s.id);
    expect(curses).toEqual(["petrificus-totalus", "locomotor-mortis"]);
    expect(spellRegistry.getByCategory("healing")).toEqual([]);
  });

  it("matches incantations loosely, as speech recognition would produce them", () => {
    expect(spellRegistry.findByIncantation("wingardium leviosa!")?.id).toBe(
      "wingardium-leviosa",
    );
    expect(spellRegistry.findByIncantation("  ALOHOMORA ")?.id).toBe("alohomora");
    expect(spellRegistry.findByIncantation("leviosa")).toBeUndefined();
  });

  it("finds previous and next spells in library order", () => {
    const first = spellRegistry.getAdjacent("wingardium-leviosa");
    expect(first.previous).toBeUndefined();
    expect(first.next?.id).toBe("alohomora");
    const last = spellRegistry.getAdjacent("lacarnum-inflamari");
    expect(last.previous?.id).toBe("lumos-solem");
    expect(last.next).toBeUndefined();
    expect(spellRegistry.getAdjacent("nope")).toEqual({});
  });

  it("returns works in reading order", () => {
    const shuffled: Work[] = [
      { id: "b", title: "B", shortTitle: "B", order: 2, media: ["book"] },
      { id: "a", title: "A", shortTitle: "A", order: 1, media: ["book"] },
    ];
    expect(
      createSpellRegistry([], shuffled)
        .works()
        .map((w) => w.id),
    ).toEqual(["a", "b"]);
  });
});

describe("createSpellRegistry integrity", () => {
  it("rejects duplicate ids", () => {
    expect(() => createSpellRegistry([leviosa, leviosa], works)).toThrow(
      SpellRegistryError,
    );
  });

  it("rejects duplicate incantations under different ids", () => {
    const clone: SpellDefinition = { ...leviosa, id: "levitation-copy" };
    expect(() => createSpellRegistry([leviosa, clone], works)).toThrow(/incantation/);
  });

  it("rejects references to unknown works", () => {
    const orphan: SpellDefinition = {
      ...leviosa,
      appearances: [{ medium: "film", workId: "unknown-work" }],
    };
    expect(() => createSpellRegistry([orphan], works)).toThrow(/unknown work/);
  });
});

describe("normalizeIncantation", () => {
  it("strips accents, punctuation, case, and extra whitespace", () => {
    expect(normalizeIncantation("  Lúmos,   SOLEM! ")).toBe("lumos solem");
  });
});
