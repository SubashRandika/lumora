import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type ShaderMaterial,
} from "three";
import {
  blendPoseToRest,
  DOOR_OPEN_ANGLE,
  planUnlock,
  UNLOCK_OPEN,
  UNLOCK_REST,
  unlockPose,
  type UnlockPlan,
  type UnlockPose,
} from "@/domain/casting/outcomes";
import { DOOR_PARTS, DOORWAY, WARD_OPACITY } from "../../objects/targets";
import { SCENE } from "../../palette";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to ease shut and warded again: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
/** The door frame's world z (the prop stands 0.1 m forward of the pedestal spot). */
const DOOR_Z = 0.1;
/** Where the hinge sits, in door space. */
const HINGE_X = -0.55;
const LEAF_WIDTH = 1.1;
/** Candle-warm light from the room beyond. */
const SPILL_COLOR = "#ffc47a";
const MOTE_COLOR = "#ffe2a8";
/** How far a ward piece drifts from the lock when fully scattered, in metres. */
const WARD_DRIFT = 0.1;

type Mode = "rest" | "resist" | "unlock" | "open" | "return";

const now = () => performance.now() / 1000;

/*
 * Light through the gap: a quad just in front of the doorway that lights only
 * the part the swinging leaf no longer covers, brightest at the leaf's edge.
 */
const GAP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GAP_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSpill;
  uniform float uEdge;
  uniform float uHalfWidth;
  varying vec2 vUv;
  void main() {
    float x = (vUv.x - 0.5) * 2.0 * uHalfWidth;
    float open = smoothstep(uEdge - 0.005, uEdge + 0.04, x);
    // Square by multiplying: pow() with a negative base is undefined in GLSL and
    // gives NaN on real GPUs, which bloom then smears across the whole frame as black.
    float d = (x - uEdge - 0.025) / 0.03;
    float rim = exp(-d * d);
    // Candlelight beyond: strongest low down and fading toward the lintel,
    // soft toward the far jamb, so the room behind still shows through.
    float height = pow(max(1.0 - vUv.y, 0.0), 1.6) * 0.85 + 0.12;
    height *= smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float across = mix(1.0, 0.55, smoothstep(uEdge, uHalfWidth, x));
    float a = uSpill * open * (0.7 * height * across + 0.55 * rim * (0.35 + height));
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/*
 * The wedge of light the gap throws across the floor: each floor point is lit
 * if a ray from a glow behind the door reaches it through the open part.
 */
const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSpill;
  uniform float uEdge;
  uniform float uHalfWidth;
  uniform vec2 uSize;
  varying vec2 vUv;
  const float SOURCE_BEHIND = 1.1;
  void main() {
    float x = (vUv.x - 0.5) * uSize.x;
    // Plane y runs away from the door: 0 at the threshold.
    float s = (1.0 - vUv.y) * uSize.y;
    float atDoor = x * SOURCE_BEHIND / (SOURCE_BEHIND + s);
    float soft = 0.02 + s * 0.03;
    float lit = smoothstep(uEdge - soft, uEdge + soft, atDoor)
      * (1.0 - smoothstep(uHalfWidth - soft, uHalfWidth + soft, atDoor));
    float a = uSpill * lit * exp(-s * 1.1) * 0.75 * smoothstep(0.0, 0.06, s);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const FLOOR_SIZE = { width: 2.8, depth: 2.2 } as const;

interface DoorParts {
  group: Group;
  leaf: Object3D | null;
  lock: Object3D | null;
  shackle: Object3D | null;
  ward: Object3D | null;
  lockY: number;
  shackleY: number;
}

function findParts(group: Group): DoorParts {
  const lock = group.getObjectByName(DOOR_PARTS.lock) ?? null;
  const shackle = group.getObjectByName(DOOR_PARTS.shackle) ?? null;
  return {
    group,
    leaf: group.getObjectByName(DOOR_PARTS.leaf) ?? null,
    lock,
    shackle,
    ward: group.getObjectByName(DOOR_PARTS.ward) ?? null,
    lockY: lock?.position.y ?? 0,
    shackleY: shackle?.position.y ?? 0,
  };
}

/** Puts every moving part of the door in `pose`. */
function applyPose(parts: DoorParts, pose: UnlockPose, wardColor: Color) {
  if (parts.leaf) parts.leaf.rotation.y = pose.doorOpen;
  if (parts.lock) {
    parts.lock.position.y = parts.lockY - pose.lockDrop;
    parts.lock.rotation.set(pose.lockSway, 0, pose.lockSwing);
  }
  if (parts.shackle) {
    parts.shackle.position.y = parts.shackleY + pose.shackleLift;
    // Negative turns the free leg out toward the viewer, away from the door.
    parts.shackle.rotation.y = -pose.shackleTurn;
  }
  if (parts.ward) {
    const opacity =
      WARD_OPACITY * pose.ward + 0.55 * pose.wardFlare * (1 - 0.5 * pose.wardSpread);
    parts.ward.visible = opacity > 0.004;
    parts.ward.scale.setScalar(1 + 0.12 * pose.wardFlare);
    parts.ward.children.forEach((piece, i) => {
      const angle = (piece.userData.angle as number | undefined) ?? 0;
      const drift = WARD_DRIFT * pose.wardSpread;
      piece.position.set(
        Math.cos(angle) * drift,
        Math.sin(angle) * drift - drift * drift * 2,
        0,
      );
      piece.rotation.z = pose.wardSpread * (i % 2 ? 0.5 : -0.4);
    });
    const material = (parts.ward.children[0] as Mesh | undefined)?.material as
      MeshBasicMaterial | undefined;
    if (material) {
      material.opacity = Math.min(1, opacity);
      material.color.copy(wardColor);
    }
  }
}

/**
 * The unlock outcome, on the warded door: the ward ring resists as the spell
 * strikes, then flares and cracks apart; the shackle springs and the padlock
 * drops and swings; the door swings partly open with warm light spilling
 * through the gap, and it stays open. The next cast (or a cancel) eases it shut
 * and warded again before the spell lands, so every cast starts from the beginning.
 * Motion is sampled from the pure plan in `domain/casting/outcomes.ts`.
 */
export function DoorUnlock({ quality }: OutcomeProps) {
  const rig = useCastRig();

  const gap = useRef<ShaderMaterial>(null);
  const floor = useRef<ShaderMaterial>(null);
  const gapMesh = useRef<Mesh>(null);
  const floorMesh = useRef<Mesh>(null);
  const motes = useRef<ParticleHandle>(null);

  const uniforms = useMemo(
    () => ({
      gap: {
        uColor: { value: new Color(SPILL_COLOR) },
        uSpill: { value: 0 },
        uEdge: { value: DOORWAY.halfWidth },
        uHalfWidth: { value: DOORWAY.halfWidth },
      },
      floor: {
        uColor: { value: new Color(SPILL_COLOR) },
        uSpill: { value: 0 },
        uEdge: { value: DOORWAY.halfWidth },
        uHalfWidth: { value: DOORWAY.halfWidth },
        uSize: { value: new Vector2(FLOOR_SIZE.width, FLOOR_SIZE.depth) },
      },
    }),
    [],
  );

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    resistSeconds: 0.4,
    plan: null as UnlockPlan | null,
    reducedMotion: false,
    motesOn: false,
    pose: { ...UNLOCK_REST } as UnlockPose,
    from: { ...UNLOCK_REST } as UnlockPose,
    gold: new Color(SCENE.gold),
    flare: new Color(),
    wardColor: new Color(),
  });
  const parts = useRef<DoorParts | null>(null);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "unlock") return;
      const r = run.current;
      r.flare.set(cue.spell.visualEffect.palette.core);
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        // A fresh cast always starts from rest, even straight after a cancel.
        r.pose = { ...UNLOCK_REST };
        r.mode = "resist";
        r.resistSeconds = Math.max(0.25, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        r.plan = planUnlock(cue.duration);
        r.mode = "unlock";
        r.motesOn = false;
        r.start = now();
      }
    },
    reset: () => {
      const r = run.current;
      motes.current?.stop(RETURN_SECONDS);
      r.motesOn = false;
      if (r.mode === "rest" || r.mode === "return") return;
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the door shut and warded if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) applyPose(findParts(group), UNLOCK_REST, new Color(SCENE.gold));
    },
    [rig],
  );

  useFrame(() => {
    const r = run.current;
    const t = now() - r.start;
    let pose: UnlockPose = UNLOCK_REST;

    switch (r.mode) {
      case "resist": {
        // The ward pushes back as the spell strikes: it flickers and the lock rattles.
        const decay = 1 - t / r.resistSeconds;
        if (decay <= 0) {
          r.mode = "rest";
          break;
        }
        pose = {
          ...UNLOCK_REST,
          wardFlare: decay * (0.45 + 0.35 * Math.sin(t * 38)),
          lockSwing: r.reducedMotion ? 0 : Math.sin(t * 55) * 0.05 * decay,
        };
        break;
      }
      case "unlock": {
        if (!r.plan) break;
        pose = unlockPose(r.plan, t, r.reducedMotion);
        if (!r.motesOn && t >= r.plan.openAt) {
          r.motesOn = true;
          motes.current?.emit({
            motion: "rise",
            origin: new Vector3(0.28, 0.02, DOOR_Z + 0.55),
            duration: r.plan.open + r.plan.settle,
            color: MOTE_COLOR,
            color2: SPILL_COLOR,
            size: 0.016,
          });
        }
        // Finished: the door stays open, light spilling and motes drifting, until the next cast.
        if (t >= r.plan.total) r.mode = "open";
        break;
      }
      case "open":
        pose = UNLOCK_OPEN;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, UNLOCK_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const group = rig.targetGroup.current;
    if (group && parts.current?.group !== group) parts.current = findParts(group);
    r.wardColor.copy(r.gold).lerp(r.flare, Math.min(1, pose.wardFlare));
    if (parts.current) applyPose(parts.current, pose, r.wardColor);

    // Candle-warm light breathes a little while it spills, unless motion is reduced.
    const elapsed = now();
    const breathe = r.reducedMotion
      ? 1
      : 1 + 0.08 * Math.sin(elapsed * 9.1) * Math.sin(elapsed * 3.3 + 1);
    const spill = pose.spill * breathe;
    // Where the leaf's free edge appears across the doorway, in door space.
    const edge = HINGE_X + LEAF_WIDTH * Math.cos(pose.doorOpen);
    for (const [material, mesh] of [
      [gap.current, gapMesh.current],
      [floor.current, floorMesh.current],
    ] as const) {
      if (!material || !mesh) continue;
      mesh.visible = spill > 0.004;
      // Without bloom the glow has no halo to carry it, so it needs more body.
      material.uniforms.uSpill!.value = spill * (quality.postprocessing.bloom ? 1 : 1.6);
      material.uniforms.uEdge!.value = edge;
    }

    rig.setOutcomeAmount(Math.max(pose.doorOpen / DOOR_OPEN_ANGLE, 1 - pose.ward, 0));
  });

  return (
    <group>
      <mesh
        ref={gapMesh}
        position={[0, DOORWAY.height / 2, DOOR_Z + 0.045]}
        visible={false}
        renderOrder={2}
      >
        <planeGeometry args={[DOORWAY.halfWidth * 2, DOORWAY.height]} />
        <shaderMaterial
          ref={gap}
          vertexShader={GAP_VERTEX}
          fragmentShader={GAP_FRAGMENT}
          uniforms={uniforms.gap}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={floorMesh}
        position={[0, 0.014, DOOR_Z + 0.09 + FLOOR_SIZE.depth / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={2}
      >
        <planeGeometry args={[FLOOR_SIZE.width, FLOOR_SIZE.depth]} />
        <shaderMaterial
          ref={floor}
          vertexShader={GAP_VERTEX}
          fragmentShader={FLOOR_FRAGMENT}
          uniforms={uniforms.floor}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <SpellParticles
        count={Math.max(16, Math.round(quality.particleBudget * 0.02))}
        seed={307}
        handleRef={motes}
      />
    </group>
  );
}
