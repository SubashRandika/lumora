import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_CASTING_STATE, useCastingStore } from "./castingStore";
import { DEFAULT_SETTINGS, useSettingsStore } from "./settingsStore";

const casting = () => useCastingStore.getState();

describe("castingStore", () => {
  beforeEach(() => {
    useCastingStore.setState(INITIAL_CASTING_STATE);
  });

  it("will not cast without a selected spell", () => {
    casting().startCasting("button");
    expect(casting().castingState).toBe("idle");
  });

  it("selects, casts, advances to completion, and resets", () => {
    casting().selectSpell("wingardium-leviosa");
    casting().startCasting("keyboard");
    expect(casting()).toMatchObject({ castingState: "preparing", lastInput: "keyboard" });

    for (let i = 0; i < 5; i++) casting().advanceCasting();
    expect(casting().castingState).toBe("completed");

    casting().resetCasting();
    expect(casting().castingState).toBe("idle");
    expect(casting().selectedSpellId).toBe("wingardium-leviosa");
  });

  it("ignores spell changes mid-cast", () => {
    casting().selectSpell("alohomora");
    casting().startCasting("button");
    casting().selectSpell("lumos-solem");
    expect(casting().selectedSpellId).toBe("alohomora");
  });

  it("lets a new spell be chosen after completion, returning to idle", () => {
    casting().selectSpell("alohomora");
    casting().startCasting("button");
    for (let i = 0; i < 5; i++) casting().advanceCasting();
    casting().selectSpell("lumos-solem");
    expect(casting()).toMatchObject({
      selectedSpellId: "lumos-solem",
      castingState: "idle",
    });
  });

  it("records the failure reason and clears it on the next cast", () => {
    casting().selectSpell("alohomora");
    casting().startCasting("button");
    casting().failCasting("assets-unavailable");
    expect(casting()).toMatchObject({
      castingState: "failed",
      failureReason: "assets-unavailable",
    });
    casting().startCasting("button");
    expect(casting()).toMatchObject({ castingState: "preparing", failureReason: null });
  });

  it("cancels back to idle", () => {
    casting().selectSpell("alohomora");
    casting().startCasting("button");
    casting().advanceCasting();
    casting().cancelCasting();
    expect(casting().castingState).toBe("idle");
  });
});

describe("settingsStore", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  it("starts from defaults", () => {
    expect(useSettingsStore.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it("clamps master volume", () => {
    useSettingsStore.getState().setMasterVolume(1.8);
    expect(useSettingsStore.getState().masterVolume).toBe(1);
    useSettingsStore.getState().setMasterVolume(-3);
    expect(useSettingsStore.getState().masterVolume).toBe(0);
    useSettingsStore.getState().setMasterVolume(Number.NaN);
    expect(useSettingsStore.getState().masterVolume).toBe(0);
  });

  it("persists preferences to localStorage", () => {
    useSettingsStore.getState().setGraphics("low");
    useSettingsStore.getState().setSoundEnabled(false);
    const stored = JSON.parse(localStorage.getItem("magic-words:settings") ?? "{}");
    expect(stored.state).toMatchObject({ graphics: "low", soundEnabled: false });
  });
});
