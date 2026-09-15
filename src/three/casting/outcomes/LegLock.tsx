import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
} from "three";
import {
  blendPoseToRest,
  LEG_LOCK_BOUND,
  LEG_LOCK_REST,
  legLockPose,
  planLegLock,
  type LegLockPlan,
  type LegLockPose,
} from "@/domain/casting/outcomes";
import { ARM_REST_ANGLE, MANNEQUIN_PARTS } from "../../objects/targets";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to release back to rest: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
const DUST = "#b9a988";

/** The bands wrap the dummy's post between these heights, in the prop's own space. */
const BAND = {
  from: 0.12,
  to: 0.94,
  turns: 4,
  /** Radius while spiralling in, and pulled tight against the post. */
  loose: 0.2,
  tight: 0.05,
  thickness: 0.012,
  lengthSegments: 160,
  ringSegments: 6,
} as const;

type Mode = "rest" | "strike" | "lock" | "bound" | "return";

const now = () => performance.now() / 1000;

/*
 * Two counter-spiralling glowing ribbons. The vertex shader places every
 * vertex on its helix, so loosening and cinching is one uniform. The fragment
 * shader reveals them from the base up. All GLSL stays defined on real GPUs:
 * no pow() of negatives and smoothstep edges in ascending order.
 */
const BAND_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aAngle;
  attribute float aDir;
  uniform float uCinch;
  varying float vT;
  varying float vFacing;
  const float TAU = 6.2831853;
  void main() {
    float theta = aDir * aT * ${BAND.turns.toFixed(1)} * TAU + (aDir < 0.0 ? 3.14159265 : 0.0);
    float radius = mix(${BAND.loose.toFixed(3)}, ${BAND.tight.toFixed(3)}, uCinch);
    vec3 outward = vec3(cos(theta), 0.0, sin(theta));
    vec3 centre = outward * radius + vec3(0.0, mix(${BAND.from.toFixed(3)}, ${BAND.to.toFixed(3)}, aT), 0.0);
    vec3 p = centre + (outward * cos(aAngle) + vec3(0.0, 1.0, 0.0) * sin(aAngle)) * ${BAND.thickness.toFixed(3)};
    vT = aT;
    vFacing = cos(aAngle);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const BAND_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uReveal;
  uniform float uGlow;
  uniform float uTime;
  varying float vT;
  varying float vFacing;
  void main() {
    float shown = 1.0 - smoothstep(uReveal - 0.04, uReveal, vT);
    float pulse = 0.75 + 0.25 * sin(vT * 40.0 - uTime * 6.0);
    float a = uGlow * shown * pulse;
    if (a < 0.003) discard;
    vec3 color = mix(uColor, uCore, (0.5 + 0.5 * vFacing) * 0.7);
    // Brighter than the palette alone, so the bands still read once the spell light fades.
    gl_FragColor = vec4(color * a * 1.7, a);
  }
`;

function buildBands() {
  const { lengthSegments: L, ringSegments: R } = BAND;
  const t: number[] = [];
  const angle: number[] = [];
  const dir: number[] = [];
  const index: number[] = [];
  for (const d of [1, -1]) {
    const base = t.length;
    for (let i = 0; i <= L; i++) {
      for (let j = 0; j <= R; j++) {
        t.push(i / L);
        angle.push((j / R) * Math.PI * 2);
        dir.push(d);
      }
    }
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < R; j++) {
        const a = base + i * (R + 1) + j;
        const b = a + R + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  // Positions come from the shader; three still needs the attribute.
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(t.length * 3), 3),
  );
  geometry.setAttribute("aT", new Float32BufferAttribute(t, 1));
  geometry.setAttribute("aAngle", new Float32BufferAttribute(angle, 1));
  geometry.setAttribute("aDir", new Float32BufferAttribute(dir, 1));
  geometry.setIndex(index);
  return geometry;
}

interface DummyParts {
  group: Group;
  arms: Object3D[];
}

function findParts(group: Group): DummyParts {
  const arms: Object3D[] = [];
  group.traverse((object) => {
    if (object.name === MANNEQUIN_PARTS.arm) arms.push(object);
  });
  return { group, arms };
}

/** Hops and tilts the whole dummy about its base, and flaps its arms. */
function applyBody(parts: DummyParts, pose: LegLockPose) {
  parts.group.position.set(0, pose.lift, 0);
  parts.group.rotation.set(pose.tiltX, 0, pose.tiltZ);
  for (const arm of parts.arms) {
    arm.rotation.z =
      ((arm.userData.side as number) ?? 1) * (ARM_REST_ANGLE - pose.armFlail);
  }
}

/**
 * The leg-lock outcome, on the practice dummy: glowing bands spiral up its
 * legs and cinch tight with a snap, it hops three times, each smaller,
 * wobbling for balance, teeters, rights itself, and stays bound. The next
 * cast (or a cancel) loosens the bands into drifting sparks before the spell
 * lands, so every cast starts from the beginning. Motion is sampled from the
 * pure plan in `domain/casting/outcomes.ts`.
 */
export function LegLock({ spell, quality }: OutcomeProps) {
  const rig = useCastRig();
  const bandsMesh = useRef<Mesh>(null);
  const bandsMaterial = useRef<ShaderMaterial>(null);
  const dust = useRef<ParticleHandle>(null);
  const sparks = useRef<ParticleHandle>(null);

  const geometry = useMemo(() => buildBands(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(
    () => ({
      uCinch: { value: 0 },
      uReveal: { value: 0 },
      uGlow: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new Color(spell.visualEffect.palette.glow) },
      uCore: { value: new Color(spell.visualEffect.palette.core) },
    }),
    [spell],
  );

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    strikeSeconds: 0.3,
    plan: null as LegLockPlan | null,
    reducedMotion: false,
    landed: 0,
    pose: { ...LEG_LOCK_REST } as LegLockPose,
    from: { ...LEG_LOCK_REST } as LegLockPose,
  });
  const parts = useRef<DummyParts | null>(null);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "leg-lock") return;
      const r = run.current;
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        r.pose = { ...LEG_LOCK_REST };
        r.mode = "strike";
        r.strikeSeconds = Math.max(0.2, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        r.plan = planLegLock(cue.duration);
        r.mode = "lock";
        r.landed = 0;
        r.start = now();
      }
    },
    reset: () => {
      const r = run.current;
      if (r.mode === "rest" || r.mode === "return") return;
      // The bands come apart into drifting sparks.
      if (r.pose.bands > 0.3) {
        sparks.current?.emit({
          motion: "rise",
          origin: new Vector3(0, 0.25, 0),
          duration: 2,
          color: spell.visualEffect.palette.core,
          color2: spell.visualEffect.palette.glow,
          size: 0.02,
        });
        sparks.current?.stop(1.2);
      }
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the dummy unbound and still if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      rig.targetOffset.set(0, 0, 0);
      const group = rig.targetGroup.current;
      if (group) applyBody(findParts(group), LEG_LOCK_REST);
    },
    [rig],
  );

  useFrame(() => {
    const r = run.current;
    const t = now() - r.start;
    let pose: LegLockPose = LEG_LOCK_REST;

    switch (r.mode) {
      case "strike": {
        // The curse hits the legs: a faint glow gathers at the base.
        const k = t / r.strikeSeconds;
        if (k >= 1) r.mode = "rest";
        else pose = { ...LEG_LOCK_REST, bandGlow: 0.2 * Math.sin(Math.PI * k) };
        break;
      }
      case "lock": {
        if (!r.plan) break;
        pose = legLockPose(r.plan, t, r.reducedMotion);
        const plan = r.plan;
        // A puff of dust as each hop lands.
        while (
          !r.reducedMotion &&
          r.landed < plan.hops.length &&
          t >= plan.hops[r.landed]!.end
        ) {
          r.landed += 1;
          dust.current?.emit({
            motion: "puff",
            origin: new Vector3(0, 0.02, 0),
            duration: 1,
            color: DUST,
            color2: "#e3d6b8",
            size: 0.035,
          });
        }
        // Finished: it stays bound, bands glowing, until the next cast.
        if (t >= plan.total) r.mode = "bound";
        break;
      }
      case "bound":
        pose = LEG_LOCK_BOUND;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, LEG_LOCK_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const group = rig.targetGroup.current;
    if (group && parts.current?.group !== group) parts.current = findParts(group);
    if (parts.current) applyBody(parts.current, pose);
    rig.targetOffset.set(0, pose.lift, 0);

    // The bands ride along with the dummy: copy its world transform.
    const mesh = bandsMesh.current;
    const material = bandsMaterial.current;
    if (mesh && material) {
      const glow = pose.bandGlow * (quality.postprocessing.bloom ? 1 : 1.5);
      mesh.visible = glow > 0.003 && pose.bands > 0.001;
      if (group) {
        group.updateMatrixWorld();
        mesh.matrix.copy(group.matrixWorld);
      }
      material.uniforms.uCinch!.value = pose.cinch;
      material.uniforms.uReveal!.value = pose.bands * 1.04;
      material.uniforms.uGlow!.value = glow;
      material.uniforms.uTime!.value = r.reducedMotion ? 0 : now();
    }

    rig.setOutcomeAmount(pose.bands);
  });

  return (
    <group>
      <mesh
        ref={bandsMesh}
        geometry={geometry}
        matrixAutoUpdate={false}
        frustumCulled={false}
        visible={false}
        renderOrder={2}
      >
        <shaderMaterial
          ref={bandsMaterial}
          vertexShader={BAND_VERTEX}
          fragmentShader={BAND_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <SpellParticles
        count={Math.max(16, Math.round(quality.particleBudget * 0.02))}
        seed={503}
        handleRef={dust}
      />
      <SpellParticles
        count={Math.max(24, Math.round(quality.particleBudget * 0.03))}
        seed={509}
        handleRef={sparks}
      />
    </group>
  );
}
