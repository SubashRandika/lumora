import type { SpellPerformer } from "@/domain/casting/engine.types";
import { outcomeSoundEvents } from "@/domain/casting/outcomes";
import { AUDIO_CUES, isAudioCueId, resolveCue } from "./cues";
import type { SpellAudio } from "./SpellAudio";

/**
 * Sound for a cast: a charge that swells through `casting`, the release as
 * the projectile leaves, the impact, and any sounds the outcome itself makes
 * (a floating shimmer, a landing), scheduled ahead on the audio clock.
 * Sound never holds up a phase.
 */
export function createAudioPerformer(audio: SpellAudio): SpellPerformer {
  let stopCharge: (() => void) | null = null;

  return {
    id: "audio",
    perform({ spell, phase, duration }) {
      const sound = spell.sound;
      switch (phase) {
        case "casting":
          stopCharge = audio.play(resolveCue(sound?.charge, "charge"), duration);
          break;
        case "projectile":
          stopCharge?.();
          stopCharge = null;
          audio.play(resolveCue(sound?.cast, "cast"));
          break;
        case "impact":
          audio.play(resolveCue(sound?.impact, "impact"));
          break;
        case "effect":
          for (const event of outcomeSoundEvents(spell.visualEffect.outcome, duration)) {
            if (event.moment === "sustain") {
              audio.play(resolveCue(sound?.ambient, "ambient"), event.duration, event.at);
            } else if (event.moment === "finish") {
              audio.play(resolveCue(sound?.settle, "settle"), undefined, event.at);
            } else {
              const id = sound?.moments?.[event.moment];
              if (id && isAudioCueId(id))
                audio.play(AUDIO_CUES[id], event.duration, event.at);
            }
          }
          break;
        default:
          break;
      }
    },
    reset() {
      stopCharge = null;
      audio.stopAll();
    },
  };
}
