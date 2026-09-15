import type { Work } from "@/domain/spells/work.schema";

/**
 * Works in the current content pack. To expand to later books, append a work
 * here and add a sibling dataset under `data/spells/`.
 */
export const works = [
  {
    id: "philosophers-stone",
    title: "Harry Potter and the Philosopher’s Stone",
    shortTitle: "Philosopher’s Stone",
    order: 1,
    media: ["book", "film"],
  },
] as const satisfies readonly Work[];

export type WorkId = (typeof works)[number]["id"];
