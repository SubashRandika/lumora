import { describe, expect, it } from "vitest";
import { allSpells } from "@/data/spells";
import {
  EMPTY_SPELL_QUERY,
  filterSpells,
  isEmptyQuery,
  normalizeSearchText,
  parseSpellQuery,
  serializeSpellQuery,
  toggleValue,
  type SpellQuery,
} from "./query";

const ids = (query: Partial<SpellQuery>) =>
  filterSpells(allSpells, { ...EMPTY_SPELL_QUERY, ...query }).map((s) => s.id);

describe("filterSpells: search", () => {
  it("returns everything, in dataset order, for an empty query", () => {
    expect(ids({})).toEqual(allSpells.map((s) => s.id));
  });

  it("matches partial incantations", () => {
    expect(ids({ q: "levi" })).toEqual(["wingardium-leviosa"]);
  });

  it("matches common names, including hyphenated words", () => {
    // Leg-Locker (name prefix) > Unlocking (inside name) > "Locks the target…" (summary).
    expect(ids({ q: "lock" })).toEqual([
      "locomotor-mortis",
      "alohomora",
      "petrificus-totalus",
    ]);
    expect(ids({ q: "fire" })).toEqual(["lacarnum-inflamari"]);
  });

  it("is case, accent, and punctuation insensitive", () => {
    expect(ids({ q: "  PÉTRIFICUS!! " })).toEqual(["petrificus-totalus"]);
  });

  it("requires every word to match", () => {
    expect(ids({ q: "lumos solem" })).toEqual(["lumos-solem"]);
    expect(ids({ q: "lumos fire" })).toEqual([]);
  });

  it("ranks incantation matches above name or summary matches", () => {
    // "lo" starts "Locomotor" (incantation) but also appears inside "Alohomora" and "Locks…".
    expect(ids({ q: "lo" })[0]).toBe("locomotor-mortis");
  });
});

describe("filterSpells: filters", () => {
  it("ORs values within a group", () => {
    expect(ids({ categories: ["curses"] })).toEqual([
      "petrificus-totalus",
      "locomotor-mortis",
    ]);
  });

  it("ANDs across groups", () => {
    expect(ids({ categories: ["charms"], difficulties: ["intermediate"] })).toEqual([
      "lumos-solem",
      "lacarnum-inflamari",
    ]);
  });

  it("filters by medium", () => {
    expect(ids({ media: ["book"] })).toEqual([
      "wingardium-leviosa",
      "alohomora",
      "petrificus-totalus",
      "locomotor-mortis",
    ]);
    expect(ids({ media: ["book", "film"] })).toHaveLength(allSpells.length);
  });

  it("combines search with filters", () => {
    expect(ids({ q: "lock", categories: ["charms"] })).toEqual(["alohomora"]);
  });
});

describe("URL round trip", () => {
  it("parses and drops unknown values", () => {
    const params = new URLSearchParams(
      "q=lock&category=charms&category=nonsense&difficulty=expert&medium=film&medium=film",
    );
    expect(parseSpellQuery(params)).toEqual({
      q: "lock",
      categories: ["charms"],
      difficulties: [],
      media: ["film"],
    });
  });

  it("serialises in canonical order and omits empty values", () => {
    const query: SpellQuery = {
      q: " fire ",
      categories: ["curses", "charms"],
      difficulties: [],
      media: ["film"],
    };
    expect(serializeSpellQuery(query)).toBe(
      "?q=fire&category=charms&category=curses&medium=film",
    );
    expect(serializeSpellQuery(EMPTY_SPELL_QUERY)).toBe("");
  });

  it("survives a round trip", () => {
    const query: SpellQuery = {
      q: "leg locker",
      categories: ["curses"],
      difficulties: ["intermediate"],
      media: ["book"],
    };
    expect(parseSpellQuery(new URLSearchParams(serializeSpellQuery(query)))).toEqual(
      query,
    );
  });

  it("caps very long search strings", () => {
    expect(parseSpellQuery(new URLSearchParams(`q=${"a".repeat(500)}`)).q).toHaveLength(
      80,
    );
  });
});

describe("helpers", () => {
  it("normalises search text", () => {
    expect(normalizeSearchText("Leg-Locker Curse")).toBe("leg locker curse");
  });

  it("detects empty queries", () => {
    expect(isEmptyQuery({ ...EMPTY_SPELL_QUERY, q: "   " })).toBe(true);
    expect(isEmptyQuery({ ...EMPTY_SPELL_QUERY, media: ["film"] })).toBe(false);
  });

  it("toggles values immutably", () => {
    const start = ["charms"] as const;
    expect(toggleValue(start, "charms")).toEqual([]);
    expect(toggleValue(start, "curses")).toEqual(["charms", "curses"]);
    expect(start).toEqual(["charms"]);
  });
});
