import { describe, expect, it } from "vitest";
import { shouldIgnoreKey } from "./useCastingKeys";

const press = (
  key: string,
  target: EventTarget | null,
  extra: Partial<KeyboardEvent> = {},
) =>
  shouldIgnoreKey({
    key,
    target,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...extra,
  });

describe("shouldIgnoreKey", () => {
  it("handles plain keys on the page", () => {
    expect(press(" ", document.body)).toBe(false);
    expect(press("Escape", document.body)).toBe(false);
  });

  it("leaves Space to a focused button so it isn't cast twice", () => {
    const button = document.createElement("button");
    expect(press(" ", button)).toBe(true);
    expect(press("Escape", button)).toBe(false);
  });

  it("ignores typing, key repeat, and shortcuts with modifiers", () => {
    expect(press("r", document.createElement("input"))).toBe(true);
    expect(press(" ", document.body, { repeat: true })).toBe(true);
    expect(press("r", document.body, { ctrlKey: true })).toBe(true);
  });
});
