import { SPELL_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import type { Work } from "@/domain/spells/work.schema";

/**
 * schema.org structured data for a spell page. A spell is modelled as a
 * DefinedTerm in the site's glossary of spells, which describes what it is
 * without claiming to be an official source.
 */
export function spellJsonLd(spell: SpellDefinition, works: readonly Work[]) {
  const url = new URL(`/spells/${spell.id}`, site.url).toString();
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": url,
    url,
    name: spell.incantation,
    alternateName: spell.name,
    description: spell.description,
    termCode: spell.id,
    keywords: [SPELL_CATEGORIES[spell.category].label, spell.difficulty].join(", "),
    subjectOf: works.map((work) => ({ "@type": "CreativeWork", name: work.title })),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: `${site.name} spell library`,
      url: new URL("/spells", site.url).toString(),
    },
  };
}

/** Serialises JSON-LD for a <script> tag, escaping "<" so content can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
