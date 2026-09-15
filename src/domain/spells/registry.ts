import type { SpellCategoryId } from "@/config/categories";
import type { SpellDefinition } from "./spell.schema";
import type { Work } from "./work.schema";

export interface SpellRegistry {
  all(): readonly SpellDefinition[];
  getById(id: string): SpellDefinition | undefined;
  getByWork(workId: string): readonly SpellDefinition[];
  getByCategory(category: SpellCategoryId): readonly SpellDefinition[];
  /** Exact, case- and punctuation-insensitive incantation lookup. Voice casting builds on this. */
  findByIncantation(spoken: string): SpellDefinition | undefined;
  /** The spells before and after this one in library order, for previous/next navigation. */
  getAdjacent(id: string): { previous?: SpellDefinition; next?: SpellDefinition };
  works(): readonly Work[];
  getWork(workId: string): Work | undefined;
}

export class SpellRegistryError extends Error {
  override name = "SpellRegistryError";
}

export function normalizeIncantation(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds an immutable, indexed registry. Throws on integrity errors (duplicate
 * ids, unknown works) so bad content fails at build/test time, not mid-cast.
 */
export function createSpellRegistry(
  spells: readonly SpellDefinition[],
  works: readonly Work[],
): SpellRegistry {
  const worksById = new Map(works.map((work) => [work.id, work]));
  const spellsById = new Map<string, SpellDefinition>();
  const spellsByIncantation = new Map<string, SpellDefinition>();

  for (const spell of spells) {
    if (spellsById.has(spell.id)) {
      throw new SpellRegistryError(`Duplicate spell id "${spell.id}"`);
    }
    for (const appearance of spell.appearances) {
      if (!worksById.has(appearance.workId)) {
        throw new SpellRegistryError(
          `Spell "${spell.id}" references unknown work "${appearance.workId}"`,
        );
      }
    }
    const key = normalizeIncantation(spell.incantation);
    if (spellsByIncantation.has(key)) {
      throw new SpellRegistryError(`Duplicate incantation "${spell.incantation}"`);
    }
    spellsById.set(spell.id, spell);
    spellsByIncantation.set(key, spell);
  }

  const orderedWorks = [...works].sort((a, b) => a.order - b.order);
  const frozenSpells = Object.freeze([...spells]);

  return {
    all: () => frozenSpells,
    getById: (id) => spellsById.get(id),
    getByWork: (workId) =>
      frozenSpells.filter((spell) => spell.appearances.some((a) => a.workId === workId)),
    getByCategory: (category) =>
      frozenSpells.filter((spell) => spell.category === category),
    findByIncantation: (spoken) => spellsByIncantation.get(normalizeIncantation(spoken)),
    getAdjacent: (id) => {
      const index = frozenSpells.findIndex((spell) => spell.id === id);
      if (index === -1) return {};
      return { previous: frozenSpells[index - 1], next: frozenSpells[index + 1] };
    },
    works: () => orderedWorks,
    getWork: (workId) => worksById.get(workId),
  };
}
