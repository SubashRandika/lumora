import { useCastRig, usePerformer } from "../CastRig";
import { gsap } from "../gsap";

/** Generic outcome for spells without their own yet: a brief swell on impact. */
export function TargetSwell() {
  const rig = useCastRig();
  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      const group = rig.targetGroup.current;
      if (!group || cue.phase !== "impact" || cue.reducedMotion) return;
      gsap.killTweensOf(group.scale);
      gsap
        .timeline()
        .to(group.scale, {
          x: 1.05,
          y: 1.05,
          z: 1.05,
          duration: 0.12,
          ease: "power2.out",
        })
        .to(group.scale, {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.6,
          ease: "elastic.out(1, 0.4)",
        });
    },
    reset: () => {
      const group = rig.targetGroup.current;
      if (!group) return;
      gsap.killTweensOf(group.scale);
      group.scale.setScalar(1);
    },
  }));
  return null;
}
