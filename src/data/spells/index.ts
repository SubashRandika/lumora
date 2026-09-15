import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { philosophersStoneSpells } from "./philosophers-stone";

/** Every dataset in the content pack, in reading order. */
export const allSpells: readonly SpellDefinition[] = [...philosophersStoneSpells];
