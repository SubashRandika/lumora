import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  Color,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import {
  blendPoseToRest,
  MEND_MENDED,
  MEND_REST,
  mendPose,
  planMend,
  type MendPlan,
  type MendPose,
} from "@/domain/casting/outcomes";
import {
  CRACK_OPACITY,
  LENS,
  SHARD_OPACITY,
  SPECTACLES_PARTS,
  SPECTACLES_REST_ROTATION,
  SPECTACLES_REST_Y,
} from "../../objects/targets";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to crack again: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
/** How the frames face the caster at the height of the mend, in radians. */
const FACING_ROTATION = [-0.08, 0, 0] as const;
/** How high a shard arcs on its way up to the lens. */
const SHARD_ARC = 0.05;
const HAZY = new Color("#dfe8ee");
const CLEAR = new Color("#cfe3f2");
const CRACK_WHITE = new Color("#ffffff");
const GLOW_BLUE = new Color("#bfe0ff");

type Mode = "rest" | "strike" | "mend" | "mended" | "return";

const now = () => performance.now() / 1000;

/** Scratch objects reused every frame. */
const scratch = {
  home: new Vector3(),
  homeQuat: new Quaternion(),
  parentQuat: new Quaternion(),
};

interface Shard {
  mesh: Mesh;
  rest: Vector3;
  restQuat: Quaternion;
  home: readonly [number, number];
}

interface SpectacleParts {
  group: Group;
  frames: Object3D | null;
  cracked: Object3D | null;
  glass: Mesh | null;
  cracks: Mesh[];
  shards: Shard[];
  rings: Mesh[];
  sparks: Mesh[];
  glint: Mesh | null;
}

function findParts(group: Group): SpectacleParts {
  const parts: SpectacleParts = {
    group,
    frames: group.getObjectByName(SPECTACLES_PARTS.frames) ?? null,
    cracked: group.getObjectByName(SPECTACLES_PARTS.cracked) ?? null,
    glass: (group.getObjectByName(SPECTACLES_PARTS.glass) as Mesh | undefined) ?? null,
    cracks: [],
    shards: [],
    rings: [],
    sparks: [],
    glint: (group.getObjectByName(SPECTACLES_PARTS.glint) as Mesh | undefined) ?? null,
  };
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (object.name === SPECTACLES_PARTS.crack) parts.cracks.push(mesh);
    if (object.name === SPECTACLES_PARTS.ring) parts.rings.push(mesh);
    if (object.name === SPECTACLES_PARTS.spark) parts.sparks.push(mesh);
    if (object.name === SPECTACLES_PARTS.shard) {
      // The first time a shard is found it is at rest, so remember where that is.
      mesh.userData.rest ??= mesh.position.clone();
      mesh.userData.restQuat ??= mesh.quaternion.clone();
      parts.shards.push({
        mesh,
        rest: mesh.userData.rest as Vector3,
        restQuat: mesh.userData.restQuat as Quaternion,
        home: mesh.userData.home as readonly [number, number],
      });
    }
  });
  return parts;
}

/** Puts the spectacles in `pose`. */
function applyPose(parts: SpectacleParts, pose: MendPose, reducedMotion: boolean) {
  const { frames, cracked } = parts;
  if (frames) {
    frames.position.y = SPECTACLES_REST_Y + pose.lift;
    frames.rotation.set(
      SPECTACLES_REST_ROTATION[0] +
        (FACING_ROTATION[0] - SPECTACLES_REST_ROTATION[0]) * pose.turn,
      SPECTACLES_REST_ROTATION[1] +
        (FACING_ROTATION[1] - SPECTACLES_REST_ROTATION[1]) * pose.turn,
      0,
    );
    frames.updateMatrixWorld(true);
  }

  // Crack: lit along its length as the glow reaches it, then closing from one end to the other.
  for (const segment of parts.cracks) {
    const along = segment.userData.along as number;
    const lit =
      Math.min(1, Math.max(0, (pose.glowReach - along) / 0.12 + 1)) * pose.crackGlow;
    const open = Math.min(
      1,
      Math.max(0, (along + 0.15 - (1 - pose.crack) * 1.15) / 0.15),
    );
    const material = segment.material as MeshBasicMaterial;
    material.opacity = CRACK_OPACITY * open;
    material.color
      .copy(CRACK_WHITE)
      .lerp(GLOW_BLUE, lit)
      .multiplyScalar(1 + lit * 2.5);
    // A hairline crack is hard to see glowing, so it swells while lit.
    segment.scale.y = 1 + lit * 2.5;
    segment.visible = open > 0.003;
  }

  if (parts.glass) {
    const material = parts.glass.material as MeshStandardMaterial;
    material.opacity = LENS.hazy + (LENS.clear - LENS.hazy) * pose.lensClear;
    material.color.copy(HAZY).lerp(CLEAR, pose.lensClear);
  }

  // Shards: fly from the case up into the lens, fading into the glass as it clears.
  if (cracked && parts.shards.length > 0) {
    const shardMaterial = parts.shards[0]!.mesh.material as MeshStandardMaterial;
    shardMaterial.opacity = SHARD_OPACITY * (1 - pose.lensClear);
    for (const shard of parts.shards) {
      const { mesh } = shard;
      const parent = mesh.parent;
      mesh.visible = shardMaterial.opacity > 0.003;
      if (!parent) continue;
      // With reduced motion they stay on the case and simply fade as the lens clears.
      const k = reducedMotion ? 0 : pose.shards;
      if (k <= 0) {
        mesh.position.copy(shard.rest);
        mesh.quaternion.copy(shard.restQuat);
        continue;
      }
      parent.updateMatrixWorld();
      cracked.localToWorld(scratch.home.set(shard.home[0], shard.home[1], 0.002));
      parent.worldToLocal(scratch.home);
      mesh.position.copy(shard.rest).lerp(scratch.home, k);
      mesh.position.y += Math.sin(Math.PI * k) * SHARD_ARC;
      parent.getWorldQuaternion(scratch.parentQuat).invert();
      cracked.getWorldQuaternion(scratch.homeQuat).premultiply(scratch.parentQuat);
      mesh.quaternion.copy(shard.restQuat).slerp(scratch.homeQuat, k);
    }
  }

  // Rings of light sweep round both frames, a spark running ahead of each.
  const angle = pose.ringAt * Math.PI * 2 + Math.PI / 2;
  for (const ring of parts.rings) {
    ring.visible = pose.ring > 0.003;
    (ring.material as MeshBasicMaterial).opacity = pose.ring * 0.55;
  }
  for (const spark of parts.sparks) {
    const side = spark.userData.side as number;
    spark.visible = pose.ring > 0.003;
    spark.position.set(
      Math.cos(side * angle) * 0.058,
      Math.sin(side * angle) * 0.058,
      0.004,
    );
  }
  if (parts.glint) {
    parts.glint.visible = pose.glint > 0.003;
    (parts.glint.material as MeshBasicMaterial).opacity = pose.glint * 0.85;
    parts.glint.position.x = (pose.glintAt - 0.5) * LENS.radius * 1.8;
    parts.glint.scale.y = Math.sqrt(Math.max(0, 1 - ((pose.glintAt - 0.5) * 1.8) ** 2));
  }
}

/**
 * The mend outcome, on the cracked spectacles: they rise off their case and
 * turn to face the caster, the crack glows from end to end, the fallen shards
 * fly back into the lens, the crack closes and the lens clears with a glint,
 * and rings of light sweep round both frames as they settle back, mended.
 * They stay mended; the next cast (or a cancel) cracks them again, the shards
 * dropping back onto the case, before the spell lands. Motion is sampled from
 * the pure plan in `domain/casting/outcomes.ts`.
 */
export function Mending(_props: OutcomeProps) {
  const rig = useCastRig();
  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    strikeSeconds: 0.2,
    plan: null as MendPlan | null,
    reducedMotion: false,
    pose: { ...MEND_REST } as MendPose,
    from: { ...MEND_REST } as MendPose,
  });
  const parts = useRef<SpectacleParts | null>(null);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "mend") return;
      const r = run.current;
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        r.pose = { ...MEND_REST };
        r.mode = "strike";
        r.strikeSeconds = Math.max(0.2, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        r.plan = planMend(cue.duration);
        r.mode = "mend";
        r.start = now();
      }
    },
    reset: () => {
      const r = run.current;
      if (r.mode === "rest" || r.mode === "return") return;
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the spectacles cracked on their case if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) applyPose(findParts(group), MEND_REST, false);
    },
    [rig],
  );

  useFrame(() => {
    const r = run.current;
    const t = now() - r.start;
    let pose: MendPose = MEND_REST;

    switch (r.mode) {
      case "strike": {
        // The charm touches the crack: it flickers once.
        const k = t / r.strikeSeconds;
        if (k >= 1) r.mode = "rest";
        else
          pose = { ...MEND_REST, crackGlow: 0.5 * Math.sin(Math.PI * k), glowReach: 1 };
        break;
      }
      case "mend": {
        if (!r.plan) break;
        pose = mendPose(r.plan, t, r.reducedMotion);
        // Finished: they stay mended until the next cast.
        if (t >= r.plan.total) r.mode = "mended";
        break;
      }
      case "mended":
        pose = MEND_MENDED;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, MEND_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const group = rig.targetGroup.current;
    if (group && parts.current?.group !== group) parts.current = findParts(group);
    if (parts.current) applyPose(parts.current, pose, r.reducedMotion);
    rig.setOutcomeAmount(pose.lensClear);
  });

  return null;
}
