import { z } from "zod";

/**
 * A "work" is one story in a content pack: a book and/or its film adaptation.
 * Spell appearances reference works by id, so new books are added as data.
 */
export const workSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  shortTitle: z.string().min(1),
  /** Reading order within its series. */
  order: z.number().int().positive(),
  /** Omit a medium when that adaptation isn't represented in the dataset yet. */
  media: z.array(z.enum(["book", "film"])).min(1),
});

export type Work = z.infer<typeof workSchema>;
