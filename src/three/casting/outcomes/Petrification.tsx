import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
} from "three";
import {
  blendPoseToRest,
  FROST_BOTTOM,
  FROST_TOP,
  petrifyPose,
  PETRIFY_FROZEN,
  PETRIFY_REST,
  planPetrify,
  type PetrifyPlan,
  type PetrifyPose,
} from "@/domain/casting/outcomes";
import type { FrostUniforms } from "../../materials/frost";
import {
  ARM_BOUND_ANGLE,
  ARM_REST_ANGLE,
  CHALK_OPACITY,
  MANNEQUIN_PARTS,
} from "../../objects/targets";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to thaw back to rest: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
/** Height of the chalk circle, where frost has to reach to hide it. */
const CHALK_Y = 1.4;
const GLINT = "#eef7ff";
const MIST = "#cfe0ee";

type Mode = "rest" | "strike" | "petrify" | "frozen" | "return";

const now = () => performance.now() / 1000;

interface DummyParts {
  group: Group;
  arms: Object3D[];
  chalk: Mesh | null;
  frost: FrostUniforms | null;
}

function findParts(group: Group): DummyParts {
  const arms: Object3D[] = [];
  group.traverse((object) => {
    if (object.name === MANNEQUIN_PARTS.arm) arms.push(object);
  });
  const root = group.getObjectByName(MANNEQUIN_PARTS.root);
  return {
    group,
    arms,
    chalk: (group.getObjectByName(MANNEQUIN_PARTS.chalk) as Mesh | undefined) ?? null,
    frost: (root?.userData.frost as FrostUniforms | undefined) ?? null,
  };
}

/** Puts the dummy in `pose`. The target group pivots about the base, at the world origin. */
function applyPose(parts: DummyParts, pose: PetrifyPose) {
  parts.group.rotation.set(pose.tiltX, 0, pose.tiltZ);
  const angle = ARM_REST_ANGLE + (ARM_BOUND_ANGLE - ARM_REST_ANGLE) * pose.armBind;
  for (const arm of parts.arms)
    arm.rotation.z = ((arm.userData.side as number) ?? 1) * angle;
  if (parts.frost) {
    parts.frost.uFrostLine.value = pose.frostLine;
    parts.frost.uFrost.value = pose.frost;
    parts.frost.uFrostRim.value = pose.frostRim;
    parts.frost.uChill.value = pose.chill;
  }
  if (parts.chalk) {
    // The chalk sits on the surface; frost passing it hides it.
    const covered = Math.min(1, Math.max(0, (pose.frostLine - CHALK_Y) / 0.08 + 0.5));
    (parts.chalk.material as MeshBasicMaterial).opacity =
      CHALK_OPACITY * (1 - covered * pose.frost);
  }
}

/**
 * The petrify outcome, on the practice dummy: its arms snap to its sides as
 * the curse strikes, grey stone-like frost creeps up from the base with a cold
 * glowing edge and glinting ice, it rocks once stiffly like a statue, and it
 * stays frozen. The next cast (or a cancel) thaws it, frost receding with a
 * puff of mist, before the spell lands, so every cast starts from the beginning.
 * Motion is sampled from the pure plan in `domain/casting/outcomes.ts`.
 */
export function Petrification({ quality }: OutcomeProps) {
  const rig = useCastRig();
  const glints = useRef<ParticleHandle>(null);
  const mist = useRef<ParticleHandle>(null);

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    strikeSeconds: 0.4,
    plan: null as PetrifyPlan | null,
    reducedMotion: false,
    glinting: false,
    pose: { ...PETRIFY_REST } as PetrifyPose,
    from: { ...PETRIFY_REST } as PetrifyPose,
  });
  const parts = useRef<DummyParts | null>(null);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "petrify") return;
      const r = run.current;
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        r.pose = { ...PETRIFY_REST };
        r.mode = "strike";
        r.strikeSeconds = Math.max(0.25, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        r.plan = planPetrify(cue.duration);
        r.mode = "petrify";
        r.glinting = false;
        r.start = now();
      }
    },
    reset: () => {
      const r = run.current;
      glints.current?.stop(RETURN_SECONDS);
      r.glinting = false;
      if (r.mode === "rest" || r.mode === "return") return;
      // Thawing sheds a little cold mist from the base.
      if (r.pose.frost > 0.3) {
        mist.current?.emit({
          motion: "puff",
          origin: new Vector3(0, 0.06, 0),
          duration: 1.8,
          color: MIST,
          color2: "#ffffff",
          size: 0.05,
        });
      }
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the dummy unfrozen and upright if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) applyPose(findParts(group), PETRIFY_REST);
    },
    [rig],
  );

  useFrame(() => {
    const r = run.current;
    const t = now() - r.start;
    let pose: PetrifyPose = PETRIFY_REST;

    switch (r.mode) {
      case "strike": {
        // The curse hits: a faint cold shiver of light before the arms clamp.
        const decay = 1 - t / r.strikeSeconds;
        if (decay <= 0) r.mode = "rest";
        else pose = { ...PETRIFY_REST, chill: 0.25 * decay };
        break;
      }
      case "petrify": {
        if (!r.plan) break;
        pose = petrifyPose(r.plan, t, r.reducedMotion);
        const plan = r.plan;
        if (!r.glinting && t >= plan.freezeAt) {
          r.glinting = true;
          glints.current?.emit({
            motion: "orbit",
            origin: new Vector3(0, 1.05, 0),
            duration: plan.total - t,
            color: GLINT,
            color2: "#9fc6ea",
            size: 0.014,
          });
        }
        // Finished: it stays frozen, glinting, until the next cast.
        if (t >= plan.total) r.mode = "frozen";
        break;
      }
      case "frozen":
        pose = PETRIFY_FROZEN;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, PETRIFY_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const group = rig.targetGroup.current;
    if (group && parts.current?.group !== group) parts.current = findParts(group);
    if (parts.current) applyPose(parts.current, pose);

    const coverage = (pose.frostLine - FROST_BOTTOM) / (FROST_TOP - FROST_BOTTOM);
    rig.setOutcomeAmount(Math.max(pose.armBind, coverage * pose.frost, 0));
  });

  return (
    <group>
      <SpellParticles
        count={Math.max(24, Math.round(quality.particleBudget * 0.03))}
        seed={401}
        handleRef={glints}
      />
      <SpellParticles
        count={Math.max(16, Math.round(quality.particleBudget * 0.02))}
        seed={409}
        handleRef={mist}
      />
    </group>
  );
}
