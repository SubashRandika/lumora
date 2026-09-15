import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  Euler,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type Sprite,
} from "three";
import {
  blendToRest,
  levitationPose,
  planLevitation,
  REST_POSE,
  type LevitationPlan,
  type LevitationPose,
} from "@/domain/casting/outcomes";
import { PEDESTAL_TOP } from "../../objects/Pedestal";
import { TARGETS, TOME_COVER } from "../../objects/targets";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { getGlowTexture } from "../../utils/glowTexture";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** How far the tome's cover eases open at full float, in radians. */
const COVER_OPEN = 0.42;
/** Seconds to glide back to rest when a cast is cancelled mid-float. */
const RETURN_SECONDS = 0.6;
const DUST = "#b9a988";

type Mode = "rest" | "shiver" | "float" | "return";

/** Scratch objects reused every frame. */
const euler = new Euler();
const quaternion = new Quaternion();
const pivot = new Vector3();
const offset = new Vector3();

const now = () => performance.now() / 1000;

/**
 * The levitate outcome: the target shivers as the spell strikes, rises,
 * turns and bobs while hovering in a ring of sparkles, then drifts down and
 * settles with a puff of dust. Motion is sampled from the pure plan in
 * `domain/casting/outcomes.ts` against the wall clock, so the pose always
 * matches the engine's timing, even after a dropped frame or a hidden tab.
 */
export function Levitation({ spell, quality }: OutcomeProps) {
  const rig = useCastRig();
  const target = TARGETS[spell.target.model];
  const base = target.onPedestal ? PEDESTAL_TOP : 0;
  const [focusX, focusY, focusZ] = target.focus;

  const shadow = useRef<Mesh>(null);
  const underglow = useRef<Sprite>(null);
  const puff = useRef<ParticleHandle>(null);
  const texture = getGlowTexture();

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    shiverSeconds: 0.3,
    plan: null as LevitationPlan | null,
    reducedMotion: false,
    landed: false,
    pose: { ...REST_POSE } as LevitationPose,
    from: { ...REST_POSE } as LevitationPose,
    glowColor: new Color(),
  });
  const cover = useRef<{ group: Group | null; object: Object3D | null }>({
    group: null,
    object: null,
  });

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      const outcome = cue.spell.visualEffect.outcome;
      if (outcome.kind !== "levitate") return;
      const r = run.current;
      r.glowColor.set(cue.spell.visualEffect.palette.glow);
      if (cue.phase === "impact") {
        // A fresh cast always starts from rest, even straight after a cancel.
        r.pose = { ...REST_POSE };
        r.mode = cue.reducedMotion ? "rest" : "shiver";
        r.shiverSeconds = Math.max(0.25, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        r.plan = planLevitation(outcome, cue.duration);
        r.reducedMotion = cue.reducedMotion;
        r.landed = false;
        r.mode = "float";
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

  // Leave the prop at rest if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.targetOffset.set(0, 0, 0);
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) {
        group.position.set(0, 0, 0);
        group.quaternion.identity();
      }
    },
    [rig],
  );

  useFrame(() => {
    const r = run.current;
    const t = now() - r.start;
    let pose: LevitationPose = REST_POSE;
    let shiver = 0;

    switch (r.mode) {
      case "shiver": {
        const decay = 1 - t / r.shiverSeconds;
        if (decay <= 0) r.mode = "rest";
        else shiver = decay;
        break;
      }
      case "float": {
        if (!r.plan) break;
        pose = levitationPose(r.plan, t, r.reducedMotion);
        if (!r.landed && t >= r.plan.landAt) {
          r.landed = true;
          puff.current?.emit({
            motion: "puff",
            origin: new Vector3(focusX, base + 0.02, focusZ),
            duration: 1.3,
            color: DUST,
            color2: "#e3d6b8",
            size: 0.035,
          });
        }
        if (t >= r.plan.total) r.mode = "rest";
        break;
      }
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendToRest(r.from, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    // A short tremble as the spell strikes: small, fast, dying away.
    const elapsed = now();
    const lift = pose.lift + Math.abs(Math.sin(elapsed * 47)) * 0.012 * shiver;
    const tiltZ = pose.tiltZ + Math.sin(elapsed * 61) * 0.035 * shiver;

    // Rotate about the object's own centre, not the world origin.
    const group = rig.targetGroup.current;
    if (group) {
      quaternion.setFromEuler(euler.set(pose.tiltX, pose.spin, tiltZ));
      pivot.set(focusX, focusY, focusZ);
      offset.copy(pivot).negate().applyQuaternion(quaternion).add(pivot);
      group.position.set(offset.x, offset.y + lift, offset.z);
      group.quaternion.copy(quaternion);

      if (cover.current.group !== group) {
        cover.current = { group, object: group.getObjectByName(TOME_COVER) ?? null };
      }
      if (cover.current.object) cover.current.object.rotation.z = pose.open * COVER_OPEN;
    }
    rig.targetOffset.set(0, lift, 0);
    rig.setOutcomeAmount(r.plan ? Math.max(0, pose.lift / r.plan.liftHeight) : 0);

    // The contact shadow fades and softens as the object rises; it works without shadow maps.
    const air = Math.min(1, pose.lift / (r.plan?.liftHeight ?? 1));
    if (shadow.current) {
      shadow.current.scale.setScalar(0.52 + air * 0.16);
      (shadow.current.material as MeshBasicMaterial).opacity = 0.5 * (1 - 0.7 * air);
    }
    if (underglow.current) {
      underglow.current.visible = pose.glow > 0.01;
      underglow.current.position.set(focusX, focusY + lift - 0.2, focusZ);
      underglow.current.material.opacity = pose.glow * 0.3;
      underglow.current.material.color.copy(r.glowColor);
    }
  });

  return (
    <group>
      <mesh
        ref={shadow}
        position={[focusX, base + 0.003, focusZ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#000000"
          map={texture}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <sprite ref={underglow} scale={[0.8, 0.4, 1]} visible={false}>
        <spriteMaterial
          map={texture}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <SpellParticles
        count={Math.max(24, Math.round(quality.particleBudget * 0.03))}
        seed={211}
        handleRef={puff}
      />
    </group>
  );
}
