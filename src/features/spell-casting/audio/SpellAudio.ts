import { DEFAULT_SPACE, type CueLayer, type CueRecipe } from "./cues";

/**
 * A tiny Web Audio synthesiser for spell cues. The AudioContext is created
 * on the first `unlock()` with sound on, which callers make from a click or
 * key press, so browsers' autoplay rules are respected. While sound is off no
 * context is created at all. Without Web Audio, every call is a silent no-op.
 *
 * Every cue plays through one bus: a dry path plus a send into a synthesised
 * stone-hall reverb, glued by a gentle compressor. The room is what turns
 * bare oscillators into something that sounds cast in a castle.
 */
export interface SpellAudio {
  /** Create or resume the audio context. Call from a user gesture. */
  unlock(): void;
  /**
   * Play a cue. `duration` (seconds) sets how long sustained layers last;
   * `delay` (seconds) schedules it ahead on the audio clock. Returns a stop function.
   */
  play(recipe: CueRecipe, duration?: number, delay?: number): () => void;
  /** Master volume in [0, 1], already combined with the sound on/off setting. */
  setVolume(volume: number): void;
  stopAll(): void;
  dispose(): void;
}

const FADE_OUT = 0.08;
const SILENT = 0.0001;
/** Seconds of reverb tail rendered into the hall's impulse response. */
const HALL_SECONDS = 2.6;
/** Most grains a sparkle layer renders, however long or dense it is. */
const MAX_GRAINS = 160;
/** Random renders kept per layer and length before repeats start reusing them. */
const TAKES = 3;
/** C major pentatonic: sparkles never clash with each other or the chords. */
const PENTATONIC = [0, 2, 4, 7, 9];
/**
 * Sample rate for buffers rendered in JavaScript. None of them reach above
 * 12 kHz once filtered, and half the rate is half the work on the main thread;
 * the browser resamples them on playback.
 */
const RENDER_RATE = 24000;
/**
 * Filtering noise throws most of its energy away, so noisy layers are made up
 * to sit level with tonal ones at the same recipe `gain`.
 */
const MAKEUP: Record<CueLayer["kind"], number> = {
  hum: 1,
  tone: 1,
  pad: 1,
  sparkle: 1,
  drop: 1.4,
  rumble: 1.6,
  creak: 2.5,
  crackle: 2.5,
  noise: 3,
};

interface Bus {
  input: GainNode;
  reverb: AudioNode;
}

const semitones = (n: number) => 2 ** (n / 12);
const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * A stereo impulse response for a tall stone room: a few early reflections,
 * then decorrelated noise that decays and darkens as it goes.
 */
function renderHall(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * HALL_SECONDS);
  const buffer = ctx.createBuffer(2, length, rate);
  const decay = Math.exp(-5.2 / length);
  const onset = Math.floor(rate * 0.012);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    let level = 1;
    let open = 1;
    for (let i = 0; i < length; i++) {
      // Air and stone soak up the highs first, so the tail's filter closes over time.
      if ((i & 255) === 0) open = 0.92 - 0.9 * (i / length) ** 0.7;
      low += (Math.random() * 2 - 1 - low) * open;
      data[i] = low * level * (i < onset ? i / onset : 1);
      level *= decay;
    }
    for (let r = 0; r < 7; r++) {
      const at = Math.floor(rate * random(0.008, 0.07));
      data[at]! += (Math.random() < 0.5 ? -1 : 1) * random(0.3, 0.7);
    }
  }
  return buffer;
}

type LayerOf<K extends CueLayer["kind"]> = Extract<CueLayer, { kind: K }>;

/**
 * Short, decaying pops of varied size, each placed somewhere across the
 * stereo field, whose density ramps from `fromDensity` to `toDensity`.
 */
export function renderCrackle(
  ctx: BaseAudioContext,
  layer: LayerOf<"crackle">,
  duration: number,
): AudioBuffer {
  const rate = RENDER_RATE;
  const buffer = ctx.createBuffer(2, Math.ceil(rate * duration), rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let at = 0;
  while (at < duration) {
    const density =
      layer.fromDensity + (layer.toDensity - layer.fromDensity) * (at / duration);
    at += -Math.log(1 - Math.random()) / Math.max(0.5, density);
    const first = Math.floor(at * rate);
    const clickLength = Math.floor(rate * random(0.0015, 0.007));
    const loudness = 0.35 + Math.random() ** 2 * 0.65;
    const pan = Math.random() * Math.PI * 0.5;
    const l = Math.cos(pan) * loudness;
    const r = Math.sin(pan) * loudness;
    for (let i = 0; i < clickLength && first + i < left.length; i++) {
      const sample = (Math.random() * 2 - 1) * Math.exp((-i / clickLength) * 5);
      left[first + i]! += sample * l;
      right[first + i]! += sample * r;
    }
  }
  return buffer;
}

/**
 * Celesta-like twinkles: tiny bell grains on a pentatonic scale, each panned
 * somewhere in the room, drifting up or down through the range if asked.
 * The buffer runs past `duration` so the last grains can ring out.
 */
export function renderSparkle(
  ctx: BaseAudioContext,
  layer: LayerOf<"sparkle">,
  duration: number,
): AudioBuffer {
  const rate = RENDER_RATE;
  const length = Math.ceil(rate * (duration + layer.grainDecay * 2));
  const buffer = ctx.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const notes: number[] = [];
  for (let n = -24; n < 60; n++) {
    const hz = 261.63 * semitones(n);
    if (
      PENTATONIC.includes(((n % 12) + 12) % 12) &&
      hz >= layer.fromHz &&
      hz <= layer.toHz
    )
      notes.push(hz);
  }
  if (notes.length === 0) notes.push(layer.fromHz);

  const grains = new Map<string, Float32Array>();
  let at = 0;
  for (let grain = 0; grain < MAX_GRAINS; grain++) {
    const density =
      layer.fromDensity + (layer.toDensity - layer.fromDensity) * (at / duration);
    at += -Math.log(1 - Math.random()) / Math.max(0.5, density);
    if (at >= duration) break;
    const progress = at / duration;
    const drift =
      layer.sweep === "up" ? progress : layer.sweep === "down" ? 1 - progress : 0.5;
    const spread = layer.sweep ? notes.length * 0.35 : notes.length;
    const index = Math.round(drift * (notes.length - 1) + (Math.random() - 0.5) * spread);
    const hz = notes[Math.min(notes.length - 1, Math.max(0, index))]!;
    const decay =
      layer.grainDecay * GRAIN_LENGTHS[Math.floor(Math.random() * GRAIN_LENGTHS.length)]!;
    const grainSamples = grainOf(grains, hz, decay);
    const loudness = 0.3 + Math.random() * 0.7;
    const pan = random(0.1, 0.9) * Math.PI * 0.5;
    const l = Math.cos(pan) * loudness;
    const r = Math.sin(pan) * loudness;
    const first = Math.floor(at * rate);
    const samples = Math.min(grainSamples.length, length - first);
    for (let i = 0; i < samples; i++) {
      left[first + i]! += grainSamples[i]! * l;
      right[first + i]! += grainSamples[i]! * r;
    }
  }
  return buffer;
}

/** Grain lengths as multiples of a layer's `grainDecay`, so grains can be reused. */
const GRAIN_LENGTHS = [0.6, 0.95, 1.4];

/** One celesta note, rendered once per sparkle and mixed in wherever it twinkles. */
function grainOf(
  grains: Map<string, Float32Array>,
  hz: number,
  decay: number,
): Float32Array {
  const key = `${hz}:${decay}`;
  const cached = grains.get(key);
  if (cached) return cached;
  const rate = RENDER_RATE;
  // Rendered until the grain is about 30 dB down; the hall covers the rest.
  const grain = new Float32Array(Math.floor(rate * decay * 3.5));
  // Two damped sines as recursive resonators: y[n] = 2r*cos(w)*y[n-1] - r^2*y[n-2].
  const w1 = (2 * Math.PI * hz) / rate;
  const w2 = w1 * 4.07;
  const r1 = Math.exp(-1 / (rate * decay));
  const r2 = Math.exp(-1 / (rate * decay * 0.3));
  const a1 = 2 * r1 * Math.cos(w1);
  const b1 = r1 * r1;
  const a2 = 2 * r2 * Math.cos(w2);
  const b2 = r2 * r2;
  // The quiet, faster-dying overtone is what makes it a celesta rather than a
  // beep; it's left out where it would fold back above the Nyquist limit.
  const overtone = hz * 4.07 < rate * 0.45 ? 0.25 : 0;
  let x1 = Math.sin(w1) * r1;
  let x0 = 0;
  let y1 = Math.sin(w2) * r2 * overtone;
  let y0 = 0;
  const attack = Math.max(1, Math.floor(rate * 0.0015));
  for (let i = 0; i < grain.length; i++) {
    grain[i] = (i < attack ? i / attack : 1) * (x0 + y0);
    const x = a1 * x1 - b1 * x0;
    x0 = x1;
    x1 = x;
    const y = a2 * y1 - b2 * y0;
    y0 = y1;
    y1 = y;
  }
  grains.set(key, grain);
  return grain;
}

/**
 * Fire's body: stereo brown noise whose loudness flutters at random, like
 * air being gulped and flames tearing.
 */
export function renderRumble(
  ctx: BaseAudioContext,
  layer: LayerOf<"rumble">,
  duration: number,
): AudioBuffer {
  const rate = RENDER_RATE;
  const length = Math.ceil(rate * duration);
  const buffer = ctx.createBuffer(2, length, rate);
  const flutterChance = 1 / (rate * 0.045);
  const flutterGlide = 1 - Math.exp(-1 / (rate * 0.012));
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let brown = 0;
    let flutter = 1;
    let flutterTarget = 1;
    for (let i = 0; i < length; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      if (Math.random() < flutterChance)
        flutterTarget = 1 - layer.flutter * Math.random();
      flutter += (flutterTarget - flutter) * flutterGlide;
      data[i] = brown * 3.5 * flutter;
    }
  }
  return buffer;
}

export function createSpellAudio(): SpellAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: Bus | null = null;
  let noise: AudioBuffer | null = null;
  let volume = 0;
  const active = new Set<() => void>();

  const getContext = () => {
    if (context) return context;
    const Ctor =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    return context;
  };

  /** The shared output: dry path and hall into a glue compressor. Built once. */
  const getBus = (ctx: AudioContext, out: GainNode): Bus => {
    if (bus) return bus;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 12;
    glue.ratio.value = 3.5;
    glue.attack.value = 0.004;
    glue.release.value = 0.22;
    glue.connect(out);

    const input = ctx.createGain();
    input.connect(glue);

    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.024;
    const hall = ctx.createConvolver();
    hall.buffer = renderHall(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    preDelay.connect(hall).connect(wet).connect(glue);

    bus = { input, reverb: preDelay };
    return bus;
  };

  const getNoise = (ctx: AudioContext) => {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  };

  /** Fade in over `attack`, hold, and fade out over `release` so the sound ends at `end`. */
  const swell = (
    param: AudioParam,
    level: number,
    start: number,
    end: number,
    attack: number,
    release: number,
  ) => {
    const span = end - start;
    const a = Math.min(attack, span * 0.45);
    const r = Math.min(release, span * 0.5);
    param.setValueAtTime(SILENT, start);
    param.exponentialRampToValueAtTime(level, start + Math.max(0.002, a));
    param.setValueAtTime(level, end - r);
    param.exponentialRampToValueAtTime(SILENT, end);
  };

  /**
   * Rendered buffers (sparkle, crackle, rumble) are cached per layer and length,
   * a few random takes each, so a cast never stalls a frame re-rendering grains
   * and repeats still vary.
   */
  const takes = new WeakMap<CueLayer, Map<number, AudioBuffer[]>>();
  const renderTake = (
    layer: CueLayer,
    duration: number,
    render: () => AudioBuffer,
  ): AudioBuffer => {
    let byLength = takes.get(layer);
    if (!byLength) takes.set(layer, (byLength = new Map()));
    const key = Math.round(duration * 10);
    const buffers = byLength.get(key) ?? [];
    byLength.set(key, buffers);
    if (buffers.length < TAKES) {
      const buffer = render();
      buffers.push(buffer);
      return buffer;
    }
    return buffers[Math.floor(Math.random() * buffers.length)]!;
  };

  /** Builds one layer; returns its output gain and the sources to stop. */
  const buildLayer = (
    ctx: AudioContext,
    layer: CueLayer,
    start: number,
    duration: number,
    /** A per-play pitch factor, so repeats never sound exactly the same. */
    tune: number,
  ) => {
    const gain = layer.gain * MAKEUP[layer.kind];
    const out = ctx.createGain();
    const sources: AudioScheduledSourceNode[] = [];
    let end = start;

    switch (layer.kind) {
      case "hum": {
        // Charge-up energy: a soft chord that rises in pitch, brightens, and
        // pulses faster as the power builds, with breath rushing in under it.
        end = start + duration;
        const target = start + duration * 0.92;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 3;
        filter.frequency.setValueAtTime(400, start);
        filter.frequency.exponentialRampToValueAtTime(4200, target);

        const pulse = ctx.createGain();
        pulse.gain.value = 0.75;
        const pulseLfo = ctx.createOscillator();
        pulseLfo.frequency.setValueAtTime(3, start);
        pulseLfo.frequency.exponentialRampToValueAtTime(16, target);
        const pulseDepth = ctx.createGain();
        pulseDepth.gain.value = 0.25;
        pulseLfo.connect(pulseDepth).connect(pulse.gain);
        filter.connect(pulse).connect(out);
        sources.push(pulseLfo);

        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 5.2;
        const vibratoDepth = ctx.createGain();
        vibratoDepth.gain.value = 6;
        vibrato.connect(vibratoDepth);
        sources.push(vibrato);

        const hz = layer.hz * tune;
        const voices: Array<[number, number, OscillatorType]> = [
          [1, 1, "triangle"],
          [1.5, 0.45, "sine"],
          [2, 0.35, "triangle"],
        ];
        for (const [ratio, level, type] of voices) {
          for (const detune of layer.chorus ? [-8, 8] : [0]) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.detune.value = detune;
            osc.frequency.setValueAtTime(hz * ratio, start);
            osc.frequency.exponentialRampToValueAtTime(
              hz * ratio * semitones(layer.rise),
              target,
            );
            vibratoDepth.connect(osc.detune);
            const voiceGain = ctx.createGain();
            voiceGain.gain.value = level;
            osc.connect(voiceGain).connect(filter);
            sources.push(osc);
          }
        }

        const breath = ctx.createBufferSource();
        breath.buffer = getNoise(ctx);
        breath.loop = true;
        const breathBand = ctx.createBiquadFilter();
        breathBand.type = "bandpass";
        breathBand.Q.value = 1.4;
        breathBand.frequency.setValueAtTime(700, start);
        breathBand.frequency.exponentialRampToValueAtTime(5200, target);
        const breathGain = ctx.createGain();
        breathGain.gain.setValueAtTime(0.05, start);
        breathGain.gain.exponentialRampToValueAtTime(0.4, target);
        breath.connect(breathBand).connect(breathGain).connect(out);
        sources.push(breath);

        out.gain.setValueAtTime(SILENT, start);
        out.gain.exponentialRampToValueAtTime(gain, target);
        out.gain.setTargetAtTime(SILENT, end, 0.06);
        end += 0.35;
        break;
      }
      case "tone": {
        // Struck partials, each a slightly detuned pair that beats like a real
        // bell; high partials die first, and sine tones get a metallic strike.
        const bell = (layer.type ?? "sine") === "sine";
        const attack = bell ? 0.004 : 0.002;
        const partials = layer.partials.map((hz, i) => ({
          hz: hz * tune,
          level: 1 / (i + 1),
          decay: layer.decay / (1 + i * 0.3),
        }));
        if (bell) {
          const root = layer.partials[0]! * tune;
          partials.push({ hz: root * 2.76, level: 0.18, decay: layer.decay * 0.25 });
          partials.push({ hz: root * 5.4, level: 0.08, decay: layer.decay * 0.12 });
        }
        for (const partial of partials) {
          const partialGain = ctx.createGain();
          partialGain.gain.setValueAtTime(SILENT, start);
          partialGain.gain.exponentialRampToValueAtTime(partial.level, start + attack);
          partialGain.gain.exponentialRampToValueAtTime(SILENT, start + partial.decay);
          partialGain.connect(out);
          for (const detune of bell ? [-3, 3] : [0]) {
            const osc = ctx.createOscillator();
            osc.type = layer.type ?? "sine";
            osc.frequency.value = partial.hz;
            osc.detune.value = detune;
            osc.connect(partialGain);
            sources.push(osc);
          }
        }
        out.gain.value = gain * (bell ? 0.6 : 1);
        end = start + layer.decay + 0.05;
        break;
      }
      case "pad": {
        end = start + duration;
        const tremolo = ctx.createGain();
        tremolo.gain.value = 0.8;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = layer.tremoloHz;
        const depth = ctx.createGain();
        depth.gain.value = 0.2;
        lfo.connect(depth).connect(tremolo.gain);
        sources.push(lfo);
        tremolo.connect(out);

        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 4.6;
        const vibratoDepth = ctx.createGain();
        vibratoDepth.gain.value = layer.voice === "choir" ? 9 : 3;
        vibrato.connect(vibratoDepth);
        sources.push(vibrato);

        // A choir is bright voices shaped by the "ah" vowel's formants; glass is pure sines.
        let into: AudioNode = tremolo;
        if (layer.voice === "choir") {
          const lowpass = ctx.createBiquadFilter();
          lowpass.type = "lowpass";
          lowpass.frequency.value = 2600;
          lowpass.connect(tremolo);
          into = lowpass;
          for (const [hz, gain] of [
            [2700, 5],
            [1150, 7],
            [750, 8],
          ] as const) {
            const formant = ctx.createBiquadFilter();
            formant.type = "peaking";
            formant.frequency.value = hz;
            formant.Q.value = 2.5;
            formant.gain.value = gain;
            formant.connect(into);
            into = formant;
          }
        }

        layer.partials.forEach((hz, i) => {
          const partialGain = ctx.createGain();
          partialGain.gain.value = (1 / (i + 1)) * (layer.voice === "choir" ? 0.35 : 0.6);
          partialGain.connect(into);
          for (const detune of [-7, 0, 7]) {
            const osc = ctx.createOscillator();
            osc.type = layer.voice === "choir" ? "sawtooth" : "sine";
            osc.frequency.value = hz * tune;
            // A slow drift between voices keeps the pad from sounding static.
            osc.detune.value = detune + (i % 2 ? 2 : -2);
            vibratoDepth.connect(osc.detune);
            osc.connect(partialGain);
            sources.push(osc);
          }
        });
        swell(out.gain, gain, start, end, layer.attack, layer.release);
        end += 0.05;
        break;
      }
      case "creak": {
        end = start + duration;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = layer.filterHz;
        filter.Q.value = layer.q;
        // Stick-slip: a square wave chops the tone's loudness into a rasp.
        const grain = ctx.createGain();
        grain.gain.value = 0.55;
        const chopper = ctx.createOscillator();
        chopper.type = "square";
        chopper.frequency.value = layer.grainHz;
        const chopDepth = ctx.createGain();
        chopDepth.gain.value = 0.45;
        chopper.connect(chopDepth).connect(grain.gain);
        grain.connect(filter).connect(out);

        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(layer.hz * tune, start);
        osc.frequency.exponentialRampToValueAtTime(
          layer.hz * tune * semitones(layer.bend),
          end,
        );
        // Two slow, unrelated wobbles keep the pitch from sounding mechanical.
        for (const [rate, amount] of [
          [5.3, 0.05],
          [2.1, 0.08],
        ] as const) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = rate;
          const lfoDepth = ctx.createGain();
          lfoDepth.gain.value = layer.hz * amount;
          lfo.connect(lfoDepth).connect(osc.frequency);
          sources.push(lfo);
        }
        osc.connect(grain);
        sources.push(osc, chopper);
        swell(out.gain, gain, start, end, layer.attack, layer.release);
        end += 0.05;
        break;
      }
      case "crackle": {
        end = start + duration;
        const source = ctx.createBufferSource();
        source.buffer = renderTake(layer, duration, () =>
          renderCrackle(ctx, layer, duration),
        );
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = layer.filterHz;
        filter.Q.value = layer.q;
        source.connect(filter).connect(out);
        sources.push(source);
        swell(out.gain, gain, start, end, 0.05, 0.1);
        end += 0.05;
        break;
      }
      case "sparkle": {
        end = start + duration;
        const source = ctx.createBufferSource();
        source.buffer = renderTake(layer, duration, () =>
          renderSparkle(ctx, layer, duration),
        );
        source.playbackRate.value = tune;
        source.connect(out);
        sources.push(source);
        out.gain.value = gain * 0.5;
        end += layer.grainDecay * 2;
        break;
      }
      case "drop": {
        // A pitch that falls fast and fades: a deep cinematic whomp, or a bright zap.
        const osc = ctx.createOscillator();
        osc.type = layer.type ?? "sine";
        osc.frequency.setValueAtTime(layer.fromHz * tune, start);
        osc.frequency.exponentialRampToValueAtTime(
          layer.toHz * tune,
          start + layer.decay * 0.7,
        );
        osc.connect(out);
        sources.push(osc);
        out.gain.setValueAtTime(SILENT, start);
        out.gain.exponentialRampToValueAtTime(gain, start + 0.004);
        out.gain.exponentialRampToValueAtTime(SILENT, start + layer.decay);
        end = start + layer.decay + 0.05;
        break;
      }
      case "rumble": {
        end = start + duration;
        const source = ctx.createBufferSource();
        source.buffer = renderTake(layer, duration, () =>
          renderRumble(ctx, layer, duration),
        );
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 0.8;
        filter.frequency.value = layer.filterHz;
        source.connect(filter).connect(out);
        sources.push(source);
        swell(out.gain, gain, start, end, layer.attack, layer.release);
        end += 0.05;
        break;
      }
      case "noise": {
        const source = ctx.createBufferSource();
        source.buffer = getNoise(ctx);
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = layer.filter;
        filter.Q.value = layer.q;
        const peak = start + Math.max(0.001, layer.attack);
        filter.frequency.setValueAtTime(layer.fromHz, start);
        filter.frequency.exponentialRampToValueAtTime(
          layer.toHz,
          start + layer.attack + layer.decay,
        );
        source.connect(filter).connect(out);
        sources.push(source);
        out.gain.setValueAtTime(SILENT, start);
        out.gain.exponentialRampToValueAtTime(gain, peak);
        out.gain.exponentialRampToValueAtTime(SILENT, start + layer.attack + layer.decay);
        end = start + layer.attack + layer.decay + 0.05;
        break;
      }
    }

    // A pan sweep flies the layer across the room; old browsers without a panner play it centred.
    let output: AudioNode = out;
    if (
      layer.kind === "noise" &&
      layer.pan &&
      typeof ctx.createStereoPanner === "function"
    ) {
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(layer.pan[0], start);
      pan.pan.linearRampToValueAtTime(layer.pan[1], start + layer.attack + layer.decay);
      out.connect(pan);
      output = pan;
    }

    for (const source of sources) {
      source.start(start);
      source.stop(end);
    }
    return { out, output, sources, end, space: layer.space ?? DEFAULT_SPACE[layer.kind] };
  };

  return {
    unlock() {
      // Opening the audio device blocks for tens of milliseconds: skip it while sound is off.
      if (!context && volume <= 0) return;
      const ctx = getContext();
      if (!ctx || !master) return;
      // The gesture already pays for opening the device; build the hall now too, not mid-cast.
      getBus(ctx, master);
      if (ctx.state === "suspended") void ctx.resume();
    },

    play(recipe, duration = 1, delay = 0) {
      if (volume <= 0) return () => {};
      const ctx = getContext();
      if (!ctx || !master) return () => {};
      const { input, reverb } = getBus(ctx, master);
      const start = ctx.currentTime + 0.01 + Math.max(0, delay);
      const tune = semitones(random(-0.35, 0.35));
      const layers = recipe.map((layer) =>
        buildLayer(ctx, layer, start, Math.max(0.1, duration), tune),
      );
      const sends: GainNode[] = [];
      for (const { output, space } of layers) {
        output.connect(input);
        if (space > 0) {
          const send = ctx.createGain();
          send.gain.value = space;
          output.connect(send).connect(reverb);
          sends.push(send);
        }
      }

      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        active.delete(stop);
        const now = ctx.currentTime;
        for (const { out, sources } of layers) {
          out.gain.cancelScheduledValues(now);
          out.gain.setTargetAtTime(SILENT, now, FADE_OUT / 3);
          for (const source of sources) {
            try {
              source.stop(now + FADE_OUT);
            } catch {
              // Already stopped.
            }
          }
        }
      };
      active.add(stop);
      const last = Math.max(...layers.map((l) => l.end));
      const remaining = last - ctx.currentTime + 0.1;
      setTimeout(() => active.delete(stop), remaining * 1000);
      // The hall rings on after the sources end; free the sends once it has.
      setTimeout(
        () => {
          for (const send of sends) send.disconnect();
        },
        (remaining + HALL_SECONDS) * 1000,
      );
      return stop;
    },

    setVolume(next) {
      volume = next;
      if (master && context)
        master.gain.setTargetAtTime(Math.max(next, 0), context.currentTime, 0.05);
      if (next <= 0) for (const stop of [...active]) stop();
    },

    stopAll() {
      for (const stop of [...active]) stop();
    },

    dispose() {
      for (const stop of [...active]) stop();
      void context?.close();
      context = null;
      master = null;
      bus = null;
      noise = null;
    },
  };
}
