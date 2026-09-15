import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_CUES, type CueLayer, type CueRecipe } from "./cues";
import {
  createSpellAudio,
  renderCrackle,
  renderRumble,
  renderSparkle,
} from "./SpellAudio";

/** Enough of an OfflineAudioContext to render buffers into plain arrays. */
function fakeRenderContext(sampleRate = 48000) {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate: rate, getChannelData: (c: number) => data[c]! };
    },
  } as unknown as BaseAudioContext;
}

function peakOf(buffer: AudioBuffer, channels = 2) {
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    for (const sample of buffer.getChannelData(c)) {
      if (!Number.isFinite(sample)) return Number.NaN;
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  return peak;
}

const layersOf = <K extends CueLayer["kind"]>(kind: K) =>
  (Object.values(AUDIO_CUES) as CueRecipe[])
    .flat()
    .filter((layer): layer is Extract<CueLayer, { kind: K }> => layer.kind === kind);

/** Just enough of an AudioContext to count how often one is opened. */
class FakeAudioContext {
  static created = 0;
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = {};
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  close = vi.fn(() => Promise.resolve());
  constructor() {
    FakeAudioContext.created += 1;
  }
  sampleRate = 8000;
  private node(params: Record<string, unknown> = {}) {
    return { ...params, connect: vi.fn((node: unknown) => node) };
  }
  createGain() {
    return this.node({ gain: { value: 0, setTargetAtTime: vi.fn() } });
  }
  createDynamicsCompressor() {
    const param = () => ({ value: 0 });
    return this.node({
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    });
  }
  createDelay() {
    return this.node({ delayTime: { value: 0 } });
  }
  createConvolver() {
    return this.node({ buffer: null });
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (c: number) => data[c]! };
  }
}

describe("spell audio", () => {
  beforeEach(() => {
    FakeAudioContext.created = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never opens the audio device while sound is off", () => {
    const audio = createSpellAudio();
    audio.setVolume(0);
    audio.unlock();
    audio.play(AUDIO_CUES["charge-soft"], 1);
    expect(FakeAudioContext.created).toBe(0);
  });

  it("opens it once on unlock with sound on", () => {
    const audio = createSpellAudio();
    audio.setVolume(0.7);
    audio.unlock();
    audio.unlock();
    expect(FakeAudioContext.created).toBe(1);
  });
});

describe("rendered layers", () => {
  const ctx = fakeRenderContext();

  it("renders every sparkle as finite, audible twinkles that ring past the sound", () => {
    for (const layer of layersOf("sparkle")) {
      const buffer = renderSparkle(ctx, layer, 1.5);
      expect(buffer.length / buffer.sampleRate).toBeGreaterThan(1.5);
      const peak = peakOf(buffer);
      expect(peak, JSON.stringify(layer)).toBeGreaterThan(0.05);
      expect(peak).toBeLessThan(8);
    }
  });

  it("renders every crackle and rumble without blowing up", () => {
    for (const layer of layersOf("crackle")) {
      expect(peakOf(renderCrackle(ctx, layer, 1))).toBeLessThan(4);
    }
    for (const layer of layersOf("rumble")) {
      const peak = peakOf(renderRumble(ctx, layer, 3));
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThan(4);
    }
  });
});
