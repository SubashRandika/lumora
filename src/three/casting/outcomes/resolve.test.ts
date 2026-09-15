import { describe, expect, it } from "vitest";
import { resolveOutcomePerformer } from "./resolve";

describe("resolveOutcomePerformer", () => {
  const performers = { levitate: "levitation" };

  it("uses the dedicated performer for an outcome that has one", () => {
    expect(resolveOutcomePerformer(performers, "levitate", "generic")).toBe("levitation");
  });

  it("falls back to the generic performer otherwise", () => {
    expect(resolveOutcomePerformer(performers, "unlock", "generic")).toBe("generic");
    expect(resolveOutcomePerformer({}, "levitate", "generic")).toBe("generic");
  });
});
