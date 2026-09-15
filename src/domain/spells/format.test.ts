import { describe, expect, it } from "vitest";
import { summarizeAppearancesByWork } from "./format";

describe("summarizeAppearancesByWork", () => {
  it("merges book and film appearances of the same work", () => {
    expect(
      summarizeAppearancesByWork([
        { medium: "book", workId: "philosophers-stone", chapter: 10 },
        { medium: "film", workId: "philosophers-stone" },
        { medium: "film", workId: "chamber-of-secrets" },
      ]),
    ).toEqual([
      ["philosophers-stone", "Book, chapter 10 · Film"],
      ["chamber-of-secrets", "Film"],
    ]);
  });
});
