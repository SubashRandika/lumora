import { outcomeReleaseAt } from "@/domain/casting/outcomes";
import type { EnvironmentReactionDefinition } from "@/domain/spells/spell.schema";
import { FX_REST, useCastRig, usePerformer, type ChamberFx } from "./CastRig";
import { gsap } from "./gsap";

/*
 * Performers that don't draw anything themselves: they animate the room's
 * shared `fx` values that scene components already read. What happens to the
 * target itself lives in `outcomes/`.
 */

const REACTION_KEYS: Record<EnvironmentReactionDefinition["kind"], keyof ChamberFx> = {
  "candle-flicker": "candleFlicker",
  "dust-rise": "dustRise",
  "chamber-brighten": "brighten",
  "chamber-dim": "dim",
  tremor: "tremor",
};

/** Candles, dust, light level, and tremor react as the spell lands, then settle. */
export function EnvironmentReactions() {
  const rig = useCastRig();
  usePerformer(() => ({
    id: "environment",
    perform: ({ spell, phase, duration, reducedMotion }) => {
      const reactions = spell.environmentEffects.filter(
        (r) => !(reducedMotion && r.kind === "tremor"),
      );
      if (phase === "casting") {
        // Gathering magic unsettles the candles a little, whatever the spell.
        gsap.to(rig.fx, { candleFlicker: 0.25, duration, ease: "power1.in" });
      }
      if (phase === "impact") {
        const peak: Partial<ChamberFx> = { candleFlicker: 0.25 };
        for (const reaction of reactions)
          peak[REACTION_KEYS[reaction.kind]] = reaction.intensity;
        gsap.to(rig.fx, {
          ...peak,
          duration: Math.max(0.15, duration * 0.6),
          ease: "power2.out",
        });
      }
      if (phase === "effect") {
        const settle: Partial<ChamberFx> = {};
        for (const key of Object.values(REACTION_KEYS)) settle[key] = 0;
        // The room holds its reaction while the outcome does, then settles.
        const release = outcomeReleaseAt(spell.visualEffect.outcome, duration);
        const delay = Math.min(duration, release + duration * 0.05);
        gsap.to(rig.fx, {
          ...settle,
          delay,
          duration: duration - delay,
          ease: "sine.inOut",
        });
      }
    },
    reset: () => {
      gsap.killTweensOf(rig.fx);
      Object.assign(rig.fx, FX_REST);
    },
  }));
  return null;
}

/** Camera: lean toward the wand as magic gathers, follow the spell to the target, then return. */
export function CameraMoves() {
  const rig = useCastRig();
  usePerformer(() => ({
    id: "camera",
    perform: ({ spell, phase, duration, reducedMotion }) => {
      if (reducedMotion) return;
      const fx = rig.fx;
      switch (phase) {
        case "casting":
          gsap.to(fx, { wandFocus: 1, duration, ease: "sine.inOut" });
          break;
        case "projectile":
          gsap.to(fx, {
            wandFocus: 0,
            targetFocus: 1,
            duration: Math.max(0.35, duration),
            ease: "power2.inOut",
          });
          break;
        case "impact":
          gsap.fromTo(fx, { shake: 1 }, { shake: 0, duration: 0.45, ease: "power2.out" });
          if (duration === 0)
            gsap.to(fx, { wandFocus: 0, targetFocus: 1, duration: 0.4 });
          break;
        case "effect": {
          // Stay on the target while the outcome holds (a floating book), then ease back.
          const release = outcomeReleaseAt(spell.visualEffect.outcome, duration);
          gsap.to(fx, {
            targetFocus: 0,
            delay: release,
            duration: duration - release,
            ease: "sine.inOut",
          });
          break;
        }
        default:
          break;
      }
    },
    // Environment reactions reset the shared fx object, including camera values.
    reset: () => {},
  }));
  return null;
}
