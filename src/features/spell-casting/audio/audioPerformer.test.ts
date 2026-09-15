import { describe, expect, it, vi } from "vitest";
import type { PhaseCue } from "@/domain/casting/engine.types";
import { spellRegistry } from "@/data/registry";
import { AUDIO_CUES } from "./cues";
import { createAudioPerformer } from "./audioPerformer";
import type { SpellAudio } from "./SpellAudio";

function fakeAudio() {
  const stops: Array<ReturnType<typeof vi.fn>> = [];
  const audio: SpellAudio = {
    unlock: vi.fn(),
    play: vi.fn(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    }),
    setVolume: vi.fn(),
    stopAll: vi.fn(),
    dispose: vi.fn(),
  };
  return { audio, stops };
}

const cue = (phase: PhaseCue["phase"], spellId = "lacarnum-inflamari"): PhaseCue => ({
  spell: spellRegistry.getById(spellId)!,
  phase,
  duration: 1.3,
  reducedMotion: false,
  signal: new AbortController().signal,
});

describe("audio performer", () => {
  it("plays the spell's charge, cast, and impact cues at the right phases", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    for (const phase of ["preparing", "casting", "projectile", "impact"] as const) {
      performer.perform(cue(phase));
    }
    expect(vi.mocked(audio.play).mock.calls).toEqual([
      [AUDIO_CUES["charge-soft"], 1.3],
      [AUDIO_CUES["cast-whoosh"]],
      [AUDIO_CUES["impact-ignite"]],
    ]);
  });

  it("plays the flame catching, the fire's roar for the whole burn, and a hiss", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "lacarnum-inflamari"), duration: 3.6 });
    const calls = vi.mocked(audio.play).mock.calls;
    expect(calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["flame-catch"],
      AUDIO_CUES["fire-roar"],
      AUDIO_CUES["fire-hiss"],
    ]);
    expect(calls[1]![1]).toBeGreaterThan(2.5);
  });

  it("plays the sun's bloom, the leaves' rustle, and the vines' retreat", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "lumos-solem"), duration: 3.5 });
    const calls = vi.mocked(audio.play).mock.calls;
    expect(calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["sun-bloom"],
      AUDIO_CUES["leaf-rustle"],
      AUDIO_CUES["vine-slither"],
    ]);
    expect(calls[2]![1]).toBeCloseTo(1.5);
  });

  it("schedules a floating shimmer and a landing for a levitation", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "wingardium-leviosa"), duration: 6 });
    const [shimmer, landing] = vi.mocked(audio.play).mock.calls;
    expect(shimmer?.[0]).toBe(AUDIO_CUES["float-shimmer"]);
    expect(shimmer?.[2]).toBe(0);
    expect(landing?.[0]).toBe(AUDIO_CUES["land-soft"]);
    expect(landing?.[2]).toBeCloseTo(shimmer?.[1] ?? NaN);
  });

  it("plays the door's own sounds as it unlocks and swings open", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "alohomora"), duration: 3.5 });
    const calls = vi.mocked(audio.play).mock.calls;
    expect(calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["ward-shatter"],
      AUDIO_CUES["shackle-spring"],
      AUDIO_CUES["door-creak"],
    ]);
    const creak = calls[2]!;
    expect(creak[1]).toBeGreaterThan(1);
    expect(creak[2]).toBeGreaterThan(1);
  });

  it("plays the dummy's clamp, frost crackle, and knock", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "petrificus-totalus"), duration: 3.2 });
    const calls = vi.mocked(audio.play).mock.calls;
    expect(calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["limb-clack"],
      AUDIO_CUES["frost-crackle"],
      AUDIO_CUES["stone-knock"],
    ]);
    expect(calls[1]![1]).toBeCloseTo(1.5);
  });

  it("plays the bands' wrap and cinch, a thud per landing, and a teeter creak", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "locomotor-mortis"), duration: 3.7 });
    expect(vi.mocked(audio.play).mock.calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["band-wrap"],
      AUDIO_CUES["band-cinch"],
      AUDIO_CUES["hop-thud"],
      AUDIO_CUES["hop-thud"],
      AUDIO_CUES["hop-thud"],
      AUDIO_CUES["teeter-creak"],
    ]);
  });

  it("plays the glass hum, shard tinkle, seal chime, and ring sweep", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform({ ...cue("effect", "oculus-reparo"), duration: 3 });
    expect(vi.mocked(audio.play).mock.calls.map(([recipe]) => recipe)).toEqual([
      AUDIO_CUES["glass-hum"],
      AUDIO_CUES["shard-tinkle"],
      AUDIO_CUES["lens-seal"],
      AUDIO_CUES["ring-sweep"],
    ]);
  });

  it("stops the charge when the projectile is released", () => {
    const { audio, stops } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform(cue("casting"));
    performer.perform(cue("projectile"));
    expect(stops[0]).toHaveBeenCalledOnce();
  });

  it("uses default cues when a spell names none", () => {
    const { audio } = fakeAudio();
    const performer = createAudioPerformer(audio);
    performer.perform(cue("projectile", "oculus-reparo"));
    expect(audio.play).toHaveBeenCalledWith(AUDIO_CUES["cast-chime"]);
  });

  it("silences everything on reset", () => {
    const { audio } = fakeAudio();
    createAudioPerformer(audio).reset();
    expect(audio.stopAll).toHaveBeenCalled();
  });
});
