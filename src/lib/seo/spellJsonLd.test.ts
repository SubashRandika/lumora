import { describe, expect, it } from "vitest";
import { spellRegistry } from "@/data/registry";
import { serializeJsonLd, spellJsonLd } from "./spellJsonLd";

describe("spellJsonLd", () => {
  it("describes the spell as a defined term with its source works", () => {
    const spell = spellRegistry.getById("alohomora")!;
    const data = spellJsonLd(spell, spellRegistry.works());
    expect(data).toMatchObject({
      "@type": "DefinedTerm",
      name: "Alohomora",
      alternateName: "Unlocking Charm",
      subjectOf: [
        { "@type": "CreativeWork", name: expect.stringContaining("Philosopher") },
      ],
    });
    expect(data.url).toMatch(/\/spells\/alohomora$/);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so a value can never close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
