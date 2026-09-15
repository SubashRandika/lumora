/*
 * Every spell sound is synthesised in the browser from these recipes. There
 * are no audio files, so nothing to license and nothing to download. Cue ids
 * match the `sound` field of spell definitions.
 *
 * The palette is a film's, not a synth's: celesta twinkles and detuned bells
 * for charms, a breathy rising swell while the wand charges, a whoosh that
 * flies across the stereo field on release, a deep whomp under every impact,
 * a choir for light, and brown-noise flutter for fire, all ringing in a
 * stone hall.
 */

type Layer =
  /** A soft chord that rises, brightens, and pulses faster for the whole phase, with rushing breath: charge-up energy. */
  | {
      kind: "hum";
      hz: number;
      /** Semitones the pitch rises over the phase. */
      rise: number;
      /** Doubles every voice with a detuned twin for a shimmering beat. */
      chorus: boolean;
      gain: number;
    }
  /** Struck partials that ring and decay. Sine tones are bells with a metallic strike; triangles are knocks. */
  | {
      kind: "tone";
      partials: readonly number[];
      decay: number;
      gain: number;
      type?: OscillatorType;
    }
  /** Sustained partials that fade in, waver, and fade out: an object held aloft, a choir of light. */
  | {
      kind: "pad";
      partials: readonly number[];
      attack: number;
      release: number;
      /** Tremolo speed in Hz; its depth is fixed and gentle. */
      tremoloHz: number;
      /** `glass` (default) is pure and singing; `choir` is voices on an "ah". */
      voice?: "glass" | "choir";
      gain: number;
    }
  /** A rasping, wavering tone that lasts the whole sound: wood straining on a hinge. */
  | {
      kind: "creak";
      hz: number;
      /** Semitones the pitch bends over the sound. */
      bend: number;
      /** How fast the hinge sticks and slips, in Hz: the rasp. */
      grainHz: number;
      /** Centre of the band that shapes the tone. */
      filterHz: number;
      q: number;
      attack: number;
      release: number;
      gain: number;
    }
  /** Sparse random pops through a band that last the whole sound: frost creeping, fire spitting. */
  | {
      kind: "crackle";
      /** Pops per second at the start and at the end of the sound. */
      fromDensity: number;
      toDensity: number;
      filterHz: number;
      q: number;
      gain: number;
    }
  /** Celesta twinkles on a pentatonic scale scattered across the room for the whole sound: magic dust. */
  | {
      kind: "sparkle";
      /** Twinkles per second at the start and at the end of the sound. */
      fromDensity: number;
      toDensity: number;
      fromHz: number;
      toHz: number;
      /** Seconds each twinkle takes to fade. */
      grainDecay: number;
      /** Drift through the range over the sound, or scatter across it. */
      sweep?: "up" | "down";
      gain: number;
    }
  /** A pitch that falls fast and fades: a deep whomp under an impact, or a bright zap. */
  | {
      kind: "drop";
      fromHz: number;
      toHz: number;
      decay: number;
      type?: OscillatorType;
      gain: number;
    }
  /** Low brown noise whose loudness flutters at random for the whole sound: a fire's roar. */
  | {
      kind: "rumble";
      /** Lowpass cutoff. */
      filterHz: number;
      /** How deep the random flutter cuts, in [0, 1]. */
      flutter: number;
      attack: number;
      release: number;
      gain: number;
    }
  /** Filtered noise with a sweep: whooshes, cracks, clicks, hiss. */
  | {
      kind: "noise";
      filter: BiquadFilterType;
      fromHz: number;
      toHz: number;
      q: number;
      attack: number;
      decay: number;
      /** Stereo position at the start and end, in [-1, 1]: a whoosh flying past. */
      pan?: readonly [number, number];
      gain: number;
    };

export type CueLayer = Layer & {
  /** How much of the layer rings in the hall, in [0, 1]. Defaults per kind. */
  space?: number;
};

export type CueRecipe = readonly CueLayer[];

/** Bells and twinkles bloom in the room; thuds, pops, and rumbles stay close. */
export const DEFAULT_SPACE: Record<CueLayer["kind"], number> = {
  hum: 0.45,
  tone: 0.55,
  pad: 0.6,
  creak: 0.25,
  crackle: 0.15,
  sparkle: 0.7,
  drop: 0.25,
  rumble: 0.15,
  noise: 0.35,
};

export const AUDIO_CUES = {
  /* Charge: the wand gathering power. */
  "charge-soft": [
    { kind: "hum", hz: 196, rise: 7, chorus: true, gain: 0.11 },
    {
      kind: "sparkle",
      fromDensity: 4,
      toDensity: 30,
      fromHz: 1000,
      toHz: 4200,
      grainDecay: 0.22,
      sweep: "up",
      gain: 0.14,
    },
  ],
  "charge-rising": [
    { kind: "hum", hz: 130.81, rise: 12, chorus: true, gain: 0.12 },
    {
      kind: "pad",
      voice: "choir",
      partials: [261.63, 392, 523.25],
      attack: 1.2,
      release: 0.1,
      tremoloHz: 5,
      gain: 0.1,
    },
    {
      kind: "sparkle",
      fromDensity: 6,
      toDensity: 44,
      fromHz: 1300,
      toHz: 5300,
      grainDecay: 0.2,
      sweep: "up",
      gain: 0.16,
    },
  ],

  /* Cast: the spell leaving the wand. */
  "cast-chime": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 500,
      toHz: 3200,
      q: 1.3,
      attack: 0.05,
      decay: 0.45,
      pan: [-0.6, 0.6],
      gain: 0.16,
    },
    { kind: "tone", partials: [1318.5, 1975.5, 2637], decay: 1.8, gain: 0.16 },
    {
      kind: "sparkle",
      fromDensity: 70,
      toDensity: 2,
      fromHz: 1500,
      toHz: 5300,
      grainDecay: 0.2,
      sweep: "up",
      gain: 0.16,
    },
  ],
  "cast-click": [
    { kind: "drop", fromHz: 2400, toHz: 420, decay: 0.14, type: "triangle", gain: 0.14 },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 2400,
      toHz: 1800,
      q: 6,
      attack: 0.002,
      decay: 0.08,
      gain: 0.28,
    },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 700,
      toHz: 2800,
      q: 1.4,
      attack: 0.03,
      decay: 0.35,
      pan: [-0.5, 0.5],
      gain: 0.16,
    },
    { kind: "tone", partials: [1567.98, 2349.3], decay: 0.9, gain: 0.16 },
  ],
  "cast-crack": [
    {
      kind: "noise",
      filter: "highpass",
      fromHz: 2400,
      toHz: 900,
      q: 0.8,
      attack: 0.001,
      decay: 0.16,
      gain: 0.24,
    },
    { kind: "drop", fromHz: 700, toHz: 55, decay: 0.35, gain: 0.16 },
    {
      kind: "crackle",
      fromDensity: 160,
      toDensity: 4,
      filterHz: 4200,
      q: 0.9,
      gain: 0.16,
    },
  ],
  "cast-snap": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 3200,
      toHz: 1200,
      q: 3,
      attack: 0.001,
      decay: 0.11,
      gain: 0.3,
    },
    { kind: "drop", fromHz: 1600, toHz: 160, decay: 0.2, gain: 0.16 },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 600,
      toHz: 2600,
      q: 1.5,
      attack: 0.04,
      decay: 0.35,
      pan: [0.5, -0.5],
      gain: 0.2,
    },
    { kind: "crackle", fromDensity: 90, toDensity: 2, filterHz: 3000, q: 1, gain: 0.12 },
  ],
  "cast-flare": [
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 500,
      toHz: 7000,
      q: 1.2,
      attack: 0.08,
      decay: 0.6,
      pan: [-0.4, 0.4],
      gain: 0.18,
    },
    { kind: "tone", partials: [659.25, 987.77, 1318.5], decay: 1.8, gain: 0.14 },
    {
      kind: "sparkle",
      fromDensity: 60,
      toDensity: 4,
      fromHz: 1000,
      toHz: 4200,
      grainDecay: 0.25,
      sweep: "up",
      gain: 0.14,
    },
  ],
  "cast-whoosh": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 250,
      toHz: 2000,
      q: 1.1,
      attack: 0.1,
      decay: 0.5,
      pan: [-0.7, 0.7],
      gain: 0.28,
    },
    {
      kind: "rumble",
      filterHz: 900,
      flutter: 0.7,
      attack: 0.08,
      release: 0.6,
      gain: 0.22,
    },
    { kind: "crackle", fromDensity: 30, toDensity: 4, filterHz: 1800, q: 1, gain: 0.12 },
  ],

  /* Impact: the spell striking its target. */
  "impact-shimmer": [
    { kind: "drop", fromHz: 180, toHz: 50, decay: 0.55, gain: 0.14 },
    { kind: "tone", partials: [1046.5, 1568, 2093, 2637], decay: 2.6, gain: 0.14 },
    {
      kind: "sparkle",
      fromDensity: 50,
      toDensity: 2,
      fromHz: 1500,
      toHz: 6300,
      grainDecay: 0.28,
      sweep: "down",
      gain: 0.16,
    },
    {
      kind: "noise",
      filter: "highpass",
      fromHz: 6000,
      toHz: 9000,
      q: 0.7,
      attack: 0.01,
      decay: 1.2,
      gain: 0.04,
    },
  ],
  "impact-latch": [
    { kind: "drop", fromHz: 320, toHz: 70, decay: 0.3, gain: 0.18 },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 900,
      toHz: 500,
      q: 5,
      attack: 0.002,
      decay: 0.15,
      gain: 0.28,
    },
    { kind: "tone", partials: [220, 330], decay: 0.5, gain: 0.1, type: "triangle" },
    { kind: "tone", partials: [1760, 2637], decay: 1.2, gain: 0.1 },
  ],
  "impact-freeze": [
    { kind: "drop", fromHz: 160, toHz: 40, decay: 0.5, gain: 0.14 },
    { kind: "tone", partials: [1975.5, 2349.3, 2793.8], decay: 2.2, gain: 0.12 },
    {
      kind: "crackle",
      fromDensity: 120,
      toDensity: 8,
      filterHz: 6000,
      q: 1.2,
      gain: 0.16,
    },
    {
      kind: "noise",
      filter: "highpass",
      fromHz: 4000,
      toHz: 8000,
      q: 0.5,
      attack: 0.005,
      decay: 0.8,
      gain: 0.06,
    },
  ],
  "impact-bind": [
    { kind: "drop", fromHz: 200, toHz: 45, decay: 0.45, gain: 0.18 },
    { kind: "tone", partials: [146.8, 220], decay: 0.7, gain: 0.12, type: "triangle" },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 1400,
      toHz: 300,
      q: 1,
      attack: 0.005,
      decay: 0.3,
      gain: 0.14,
    },
    { kind: "crackle", fromDensity: 80, toDensity: 2, filterHz: 2600, q: 1, gain: 0.08 },
  ],
  "impact-mend": [
    { kind: "drop", fromHz: 140, toHz: 60, decay: 0.4, gain: 0.08 },
    { kind: "tone", partials: [783.99, 1174.66, 1567.98], decay: 2.2, gain: 0.16 },
    {
      kind: "sparkle",
      fromDensity: 40,
      toDensity: 4,
      fromHz: 1500,
      toHz: 5300,
      grainDecay: 0.25,
      sweep: "up",
      gain: 0.14,
    },
  ],
  "impact-sunburst": [
    { kind: "drop", fromHz: 140, toHz: 38, decay: 0.9, gain: 0.16 },
    { kind: "tone", partials: [523.25, 659.25, 783.99, 1046.5], decay: 3, gain: 0.14 },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 8000,
      toHz: 800,
      q: 0.7,
      attack: 0.02,
      decay: 1.4,
      gain: 0.1,
    },
    {
      kind: "sparkle",
      fromDensity: 60,
      toDensity: 6,
      fromHz: 1000,
      toHz: 6300,
      grainDecay: 0.3,
      gain: 0.14,
    },
  ],
  "impact-ignite": [
    { kind: "drop", fromHz: 110, toHz: 32, decay: 0.7, gain: 0.18 },
    {
      kind: "rumble",
      filterHz: 1800,
      flutter: 0.5,
      attack: 0.02,
      release: 0.8,
      gain: 0.18,
    },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 3000,
      toHz: 600,
      q: 0.8,
      attack: 0.03,
      decay: 0.9,
      gain: 0.1,
    },
    { kind: "crackle", fromDensity: 60, toDensity: 10, filterHz: 2200, q: 1, gain: 0.12 },
  ],

  /* Alohomora. */
  "ward-shatter": [
    {
      kind: "crackle",
      fromDensity: 140,
      toDensity: 6,
      filterHz: 5600,
      q: 2.5,
      gain: 0.2,
    },
    { kind: "tone", partials: [2637, 3520, 4186], decay: 1.1, gain: 0.08 },
    {
      kind: "sparkle",
      fromDensity: 40,
      toDensity: 2,
      fromHz: 2000,
      toHz: 6300,
      grainDecay: 0.18,
      sweep: "down",
      gain: 0.12,
    },
    {
      kind: "noise",
      filter: "highpass",
      fromHz: 5000,
      toHz: 9000,
      q: 0.6,
      attack: 0.003,
      decay: 0.45,
      gain: 0.06,
    },
  ],
  "shackle-spring": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 3200,
      toHz: 2200,
      q: 7,
      attack: 0.001,
      decay: 0.05,
      gain: 0.34,
    },
    { kind: "drop", fromHz: 260, toHz: 90, decay: 0.2, gain: 0.14 },
    {
      kind: "tone",
      partials: [1318.5, 2637],
      decay: 0.6,
      gain: 0.14,
      type: "triangle",
      space: 0.4,
    },
  ],
  "door-creak": [
    {
      kind: "creak",
      hz: 110,
      bend: 4,
      grainHz: 38,
      filterHz: 900,
      q: 4,
      attack: 0.15,
      release: 0.35,
      gain: 0.16,
    },
    {
      kind: "creak",
      hz: 233,
      bend: -3,
      grainHz: 51,
      filterHz: 1600,
      q: 6,
      attack: 0.3,
      release: 0.3,
      gain: 0.06,
    },
    { kind: "rumble", filterHz: 220, flutter: 0.3, attack: 0.3, release: 0.4, gain: 0.1 },
  ],

  /* Petrificus Totalus. */
  "limb-clack": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 1800,
      toHz: 900,
      q: 4,
      attack: 0.001,
      decay: 0.06,
      gain: 0.34,
    },
    { kind: "tone", partials: [180, 270], decay: 0.25, gain: 0.16, type: "triangle" },
    { kind: "drop", fromHz: 150, toHz: 60, decay: 0.2, gain: 0.14 },
  ],
  "frost-crackle": [
    {
      kind: "crackle",
      fromDensity: 12,
      toDensity: 70,
      filterHz: 3800,
      q: 1.2,
      gain: 0.3,
    },
    {
      kind: "pad",
      partials: [2093, 3136],
      attack: 0.6,
      release: 0.5,
      tremoloHz: 6,
      gain: 0.04,
    },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 300,
      toHz: 900,
      q: 0.8,
      attack: 0.8,
      decay: 0.7,
      gain: 0.08,
    },
  ],
  "stone-knock": [
    { kind: "drop", fromHz: 130, toHz: 45, decay: 0.3, gain: 0.14 },
    { kind: "tone", partials: [98, 147], decay: 0.35, gain: 0.14, type: "triangle" },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 700,
      toHz: 350,
      q: 2,
      attack: 0.002,
      decay: 0.12,
      gain: 0.16,
    },
  ],

  /* Locomotor Mortis. */
  "band-wrap": [
    { kind: "hum", hz: 220, rise: 12, chorus: false, gain: 0.07 },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 400,
      toHz: 2600,
      q: 2,
      attack: 0.3,
      decay: 0.15,
      pan: [-0.8, 0.8],
      gain: 0.16,
    },
    {
      kind: "sparkle",
      fromDensity: 10,
      toDensity: 40,
      fromHz: 800,
      toHz: 3200,
      grainDecay: 0.15,
      sweep: "up",
      gain: 0.12,
    },
  ],
  "band-cinch": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 3000,
      toHz: 1200,
      q: 3,
      attack: 0.001,
      decay: 0.1,
      gain: 0.24,
    },
    { kind: "drop", fromHz: 240, toHz: 70, decay: 0.25, gain: 0.12 },
    { kind: "tone", partials: [587.33, 880], decay: 0.8, gain: 0.1 },
  ],
  "hop-thud": [
    { kind: "drop", fromHz: 120, toHz: 40, decay: 0.28, gain: 0.24 },
    { kind: "tone", partials: [110, 165], decay: 0.25, gain: 0.14, type: "triangle" },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 600,
      toHz: 120,
      q: 0.7,
      attack: 0.002,
      decay: 0.12,
      gain: 0.22,
    },
  ],
  "teeter-creak": [
    {
      kind: "creak",
      hz: 160,
      bend: -4,
      grainHz: 40,
      filterHz: 1100,
      q: 4,
      attack: 0.1,
      release: 0.2,
      gain: 0.24,
    },
  ],

  /* Oculus Reparo. */
  "glass-hum": [
    {
      kind: "pad",
      partials: [1318.5, 1975.5],
      attack: 0.15,
      release: 0.15,
      tremoloHz: 7,
      gain: 0.08,
    },
  ],
  "shard-tinkle": [
    { kind: "crackle", fromDensity: 30, toDensity: 8, filterHz: 5200, q: 4, gain: 0.16 },
    {
      kind: "sparkle",
      fromDensity: 26,
      toDensity: 10,
      fromHz: 2600,
      toHz: 6300,
      grainDecay: 0.12,
      gain: 0.14,
    },
  ],
  "lens-seal": [
    { kind: "tone", partials: [1567.98, 2349.3, 3135.96], decay: 1.8, gain: 0.14 },
    { kind: "drop", fromHz: 200, toHz: 80, decay: 0.25, gain: 0.06 },
  ],
  "ring-sweep": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 1200,
      toHz: 5000,
      q: 3,
      attack: 0.25,
      decay: 0.35,
      pan: [-0.5, 0.5],
      gain: 0.08,
    },
    {
      kind: "sparkle",
      fromDensity: 16,
      toDensity: 30,
      fromHz: 1000,
      toHz: 5300,
      grainDecay: 0.2,
      sweep: "up",
      gain: 0.12,
    },
  ],

  /* Lumos Solem. */
  "sun-bloom": [
    {
      kind: "pad",
      voice: "choir",
      partials: [261.63, 392, 523.25, 659.25],
      attack: 0.35,
      release: 0.6,
      tremoloHz: 3,
      gain: 0.14,
    },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 500,
      toHz: 4000,
      q: 0.9,
      attack: 0.25,
      decay: 0.6,
      gain: 0.07,
    },
    {
      kind: "sparkle",
      fromDensity: 30,
      toDensity: 8,
      fromHz: 1000,
      toHz: 5300,
      grainDecay: 0.3,
      gain: 0.12,
    },
  ],
  "leaf-rustle": [
    {
      kind: "crackle",
      fromDensity: 90,
      toDensity: 40,
      filterHz: 2600,
      q: 0.9,
      gain: 0.32,
    },
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 1800,
      toHz: 3200,
      q: 1.5,
      attack: 0.06,
      decay: 0.5,
      pan: [0.4, -0.3],
      gain: 0.16,
    },
  ],
  "vine-slither": [
    {
      kind: "creak",
      hz: 70,
      bend: -5,
      grainHz: 22,
      filterHz: 600,
      q: 2,
      attack: 0.2,
      release: 0.4,
      gain: 0.08,
    },
    {
      kind: "crackle",
      fromDensity: 40,
      toDensity: 6,
      filterHz: 1400,
      q: 0.8,
      gain: 0.16,
    },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 1400,
      toHz: 250,
      q: 0.7,
      attack: 0.3,
      decay: 1.1,
      gain: 0.08,
    },
  ],

  /* Lacarnum Inflamari. */
  "flame-catch": [
    {
      kind: "noise",
      filter: "bandpass",
      fromHz: 300,
      toHz: 1600,
      q: 1.1,
      attack: 0.06,
      decay: 0.4,
      gain: 0.16,
    },
    {
      kind: "rumble",
      filterHz: 1400,
      flutter: 0.6,
      attack: 0.05,
      release: 0.3,
      gain: 0.18,
    },
    { kind: "crackle", fromDensity: 40, toDensity: 10, filterHz: 2200, q: 1, gain: 0.16 },
  ],
  "fire-roar": [
    {
      kind: "rumble",
      filterHz: 700,
      flutter: 0.75,
      attack: 0.5,
      release: 0.9,
      gain: 0.26,
    },
    {
      kind: "crackle",
      fromDensity: 25,
      toDensity: 70,
      filterHz: 1800,
      q: 0.9,
      gain: 0.2,
    },
    { kind: "crackle", fromDensity: 6, toDensity: 14, filterHz: 700, q: 1.5, gain: 0.12 },
  ],
  "fire-hiss": [
    {
      kind: "noise",
      filter: "highpass",
      fromHz: 5000,
      toHz: 2500,
      q: 0.6,
      attack: 0.03,
      decay: 1.1,
      gain: 0.06,
    },
    {
      kind: "rumble",
      filterHz: 400,
      flutter: 0.4,
      attack: 0.02,
      release: 0.8,
      gain: 0.1,
    },
    { kind: "crackle", fromDensity: 12, toDensity: 1, filterHz: 1500, q: 1, gain: 0.12 },
  ],

  /* Wingardium Leviosa, and the defaults. */
  "float-shimmer": [
    {
      kind: "pad",
      voice: "choir",
      partials: [293.66, 440, 587.33],
      attack: 1.1,
      release: 1.2,
      tremoloHz: 2.5,
      gain: 0.1,
    },
    {
      kind: "pad",
      partials: [1174.66, 1760],
      attack: 0.9,
      release: 1.2,
      tremoloHz: 4.5,
      gain: 0.05,
    },
    {
      kind: "sparkle",
      fromDensity: 7,
      toDensity: 4,
      fromHz: 1100,
      toHz: 4700,
      grainDecay: 0.35,
      gain: 0.12,
    },
  ],
  "land-soft": [
    { kind: "drop", fromHz: 110, toHz: 45, decay: 0.35, gain: 0.12 },
    { kind: "tone", partials: [196, 293.66], decay: 0.7, gain: 0.12, type: "triangle" },
    {
      kind: "noise",
      filter: "lowpass",
      fromHz: 900,
      toHz: 200,
      q: 0.7,
      attack: 0.004,
      decay: 0.3,
      gain: 0.14,
    },
    { kind: "tone", partials: [1174.66, 1760], decay: 1.2, gain: 0.06 },
  ],
} as const satisfies Record<string, CueRecipe>;

export type AudioCueId = keyof typeof AUDIO_CUES;

/** Used when a spell doesn't name a cue for a moment. */
export const DEFAULT_CUES = {
  charge: "charge-soft",
  cast: "cast-chime",
  impact: "impact-shimmer",
  /** While an outcome holds, e.g. an object floating. */
  ambient: "float-shimmer",
  /** When an outcome finishes, e.g. an object landing. */
  settle: "land-soft",
} as const satisfies Record<string, AudioCueId>;

export function isAudioCueId(id: string): id is AudioCueId {
  return Object.hasOwn(AUDIO_CUES, id);
}

/** The recipe for a cue id, falling back to a default when the id is unknown. */
export function resolveCue(
  id: string | undefined,
  moment: keyof typeof DEFAULT_CUES,
): CueRecipe {
  return AUDIO_CUES[id && isAudioCueId(id) ? id : DEFAULT_CUES[moment]];
}

/** Master gain in [0, 1] from settings. Sound off means silence, whatever the volume. */
export function effectiveVolume(soundEnabled: boolean, masterVolume: number): number {
  if (!soundEnabled) return 0;
  return Math.min(1, Math.max(0, masterVolume)) ** 2;
}
