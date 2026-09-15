import type { SpellAppearance, SpellDefinition } from "./spell.schema";

const DIFFICULTY_LABELS: Record<SpellDefinition["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function formatDifficulty(difficulty: SpellDefinition["difficulty"]): string {
  return DIFFICULTY_LABELS[difficulty];
}

/** "Book, chapter 10" or "Film". */
export function formatAppearance(appearance: SpellAppearance): string {
  return appearance.medium === "book" ? `Book, chapter ${appearance.chapter}` : "Film";
}

/** Groups appearances by work, preserving first-seen order: [["philosophers-stone", "Book, chapter 10 · Film"]]. */
export function summarizeAppearancesByWork(
  appearances: readonly SpellAppearance[],
): Array<[workId: string, summary: string]> {
  const grouped = new Map<string, string[]>();
  for (const appearance of appearances) {
    const labels = grouped.get(appearance.workId) ?? [];
    labels.push(formatAppearance(appearance));
    grouped.set(appearance.workId, labels);
  }
  return [...grouped].map(([workId, labels]) => [workId, labels.join(" · ")]);
}
