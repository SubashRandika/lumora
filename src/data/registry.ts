import { createSpellRegistry } from "@/domain/spells/registry";
import { allSpells } from "./spells";
import { works } from "./works";

/** The application's spell registry for the active content pack. */
export const spellRegistry = createSpellRegistry(allSpells, works);
