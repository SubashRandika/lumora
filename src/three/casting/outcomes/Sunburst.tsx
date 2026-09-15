import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type ShaderMaterial,
} from "three";
import {
  blendPoseToRest,
  planSunburst,
  SUNBURST_REST,
  SUNBURST_WITHERED,
  sunburstPose,
  witheredAmount,
  type SunburstPlan,
  type SunburstPose,
} from "@/domain/casting/outcomes";
import {
  LEAF_SCALE,
  VINE_COLORS,
  VINE_SEGMENTS,
  VINES_PARTS,
} from "../../objects/targets";
import { PEDESTAL_TOP } from "../../objects/Pedestal";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to grow back: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
/** Where the sun blazes, in world space: above the vines and a little toward the caster. */
const SUN_AT = [0, PEDESTAL_TOP + 1.05, 0.2] as const;
/** Where it settles as it softens to a glow: just over the pot. */
const GLOW_AT = [0, PEDESTAL_TOP + 0.34, 0.12] as const;
const SUN_SIZE = 2.4;
/** The pedestal's top, which the sunlight pools on. */
const POOL_SIZE = 0.72;
/** Radians each vine splays outward, away from the light, at full recoil. */
const RECOIL_SPLAY = 0.5;
/** Radians each vine also leans back, away from the caster. */
const RECOIL_LEAN = 0.12;
const STEM = new Color(VINE_COLORS.stem);
const LEAF = new Color(VINE_COLORS.leaf);
const DRY_STEM = new Color("#4d4326");
const DRY_LEAF = new Color("#7c6a3c");
const FLECK = "#9a8350";
const MOTE = "#ffe7a8";

type Mode = "rest" | "strike" | "burst" | "withered" | "return";

const now = () => performance.now() / 1000;

/*
 * The sun: a camera-facing quad with a hot core, a soft halo, and two sets of
 * turning rays. The rays come from powers of the direction as a complex
 * number, so there is no atan() (undefined at the centre). All GLSL stays
 * defined on real GPUs: no pow() of negatives and smoothstep edges in
 * ascending order.
 */
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uSun;
  uniform float uRays;
  uniform float uSpin;
  varying vec2 vUv;
  vec2 square(vec2 z) { return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec2 dir = p / (r + 0.0001);
    float c = cos(uSpin);
    float s = sin(uSpin);
    vec2 q = vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
    vec2 q4 = square(square(q));
    vec2 q8 = square(q4);
    // Slower counter-turning set: q^12 of the unspun direction, turned the other way.
    vec2 w = vec2(dir.x * c + dir.y * s, -dir.x * s + dir.y * c);
    vec2 w4 = square(square(w));
    vec2 w8 = square(w4);
    vec2 w12 = vec2(w8.x * w4.x - w8.y * w4.y, w8.x * w4.y + w8.y * w4.x);
    float long8 = max(q8.x, 0.0);
    float short12 = 0.5 + 0.5 * w12.x;
    float reach = max(uRays, 0.001);
    float rays = long8 * long8 * (1.0 - smoothstep(0.0, reach, r))
      + short12 * short12 * 0.45 * (1.0 - smoothstep(0.0, reach * 0.55, r));
    float core = exp(-r * r * 60.0);
    float halo = 1.0 / (1.0 + r * r * 28.0);
    float edge = 1.0 - smoothstep(0.75, 1.0, r);
    float a = uSun * edge * (core * 1.4 + halo * 0.55 + rays * uRays * 0.45);
    if (a < 0.003) discard;
    // A blazing sun is white-hot; the glow it softens to is gold.
    vec3 color = mix(uGlow, uCore, clamp(core + halo * 0.4, 0.0, 1.0) * (0.3 + 0.7 * uRays));
    gl_FragColor = vec4(color * a, a);
  }
`;

/* Sunlight pooled on the pedestal's top around the pot: warm, soft-edged. */
const POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uGlow;
  uniform float uPool;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float square = max(abs(p.x), abs(p.y));
    float a = uPool * exp(-r * r * 2.2) * (1.0 - smoothstep(0.88, 1.0, square)) * 0.6;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uGlow * a, a);
  }
`;

interface Leaf {
  mesh: Mesh;
  along: number;
  rest: readonly [number, number, number];
  restY: number;
}

interface Vine {
  group: Object3D;
  angle: number;
  stem: Mesh | null;
  leaves: Leaf[];
}

interface VineParts {
  group: Group;
  vines: Vine[];
}

function findParts(group: Group): VineParts {
  const vines: Vine[] = [];
  group.traverse((object) => {
    if (object.name !== VINES_PARTS.vine) return;
    const leaves: Leaf[] = [];
    let stem: Mesh | null = null;
    for (const child of object.children) {
      if (child.name === VINES_PARTS.stem) stem = child as Mesh;
      if (child.name === VINES_PARTS.leaf) {
        // The first time a leaf is found it is at rest, so remember its height.
        child.userData.restY ??= child.position.y;
        leaves.push({
          mesh: child as Mesh,
          along: child.userData.along as number,
          rest: child.userData.rest as Leaf["rest"],
          restY: child.userData.restY as number,
        });
      }
    }
    vines.push({ group: object, angle: object.userData.angle as number, stem, leaves });
  });
  return { group, vines };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Puts the vines in `pose`; `time` drives the shiver. */
function applyPose(parts: VineParts, pose: SunburstPose, time: number) {
  const dry = witheredAmount(pose);
  const stemIndices = 5 * 6;
  parts.vines.forEach((vine, i) => {
    const dx = Math.cos(vine.angle);
    const dz = Math.sin(vine.angle);
    const splay = pose.recoil * RECOIL_SPLAY;
    const sway = pose.shiver * 0.06 * Math.sin(time * 29 + i * 1.7);
    const sway2 = pose.shiver * 0.05 * Math.sin(time * 23 + i * 2.3 + 1);
    vine.group.rotation.set(
      dz * splay - pose.recoil * RECOIL_LEAN + sway,
      0,
      -dx * splay + sway2,
    );
    // Withered stubs are thinner and shorter than the vines were.
    vine.group.scale.setScalar(0.7 + 0.3 * pose.reach);

    if (vine.stem) {
      const segments = Math.max(1, Math.round(VINE_SEGMENTS * pose.reach));
      vine.stem.geometry.setDrawRange(0, segments * stemIndices);
      const material = vine.stem.material as MeshStandardMaterial;
      material.color.copy(STEM).lerp(DRY_STEM, dry * 0.7);
    }

    for (const leaf of vine.leaves) {
      // Each leaf closes and drops in just before the shrinking tip reaches it.
      const open = clamp01((pose.reach - leaf.along) / 0.12);
      const { mesh } = leaf;
      mesh.visible = open > 0.01;
      mesh.scale.set(LEAF_SCALE[0] * open, LEAF_SCALE[1], LEAF_SCALE[2] * open);
      mesh.position.y = leaf.restY - (1 - open) * 0.03;
      const flutter = pose.shiver * 0.45 * Math.sin(time * 37 + leaf.along * 20 + i);
      mesh.rotation.set(
        leaf.rest[0] + flutter,
        leaf.rest[1],
        leaf.rest[2] + flutter * 0.5,
      );
      (mesh.material as MeshStandardMaterial).color
        .copy(LEAF)
        .lerp(DRY_LEAF, (1 - open) * 0.8);
    }
  });
}

/**
 * The sunburst outcome, on the creeping vines: a blaze of warm sunlight blooms
 * over them, rays turning, pooling on the pedestal as the room brightens. The
 * vines flinch away, shivering, leaves fluttering, then shrink back into the
 * pot from their tips, leaves closing and falling in with a puff of dry flecks.
 * The light softens to a warm glow over the pot, and they stay withered back.
 * The next cast (or a cancel) grows them back before the spell lands. Motion is
 * sampled from the pure plan in `domain/casting/outcomes.ts`.
 */
export function Sunburst({ spell, quality }: OutcomeProps) {
  const rig = useCastRig();
  const sunMesh = useRef<Mesh>(null);
  const poolMesh = useRef<Mesh>(null);
  const motes = useRef<ParticleHandle>(null);
  const flecks = useRef<ParticleHandle>(null);

  const outcome = spell.visualEffect.outcome;
  const intensity = outcome.kind === "sunburst" ? outcome.intensity : 1;

  const uniforms = useMemo(
    () => ({
      sun: {
        uCore: { value: new Color(spell.visualEffect.palette.core) },
        uGlow: { value: new Color(spell.visualEffect.palette.glow) },
        uSun: { value: 0 },
        uRays: { value: 0 },
        uSpin: { value: 0 },
      },
      pool: {
        uGlow: { value: new Color(spell.visualEffect.palette.glow) },
        uPool: { value: 0 },
      },
    }),
    [spell],
  );

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    strikeSeconds: 0.3,
    plan: null as SunburstPlan | null,
    reducedMotion: false,
    flecked: false,
    pose: { ...SUNBURST_REST } as SunburstPose,
    from: { ...SUNBURST_REST } as SunburstPose,
  });
  const parts = useRef<VineParts | null>(null);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "sunburst") return;
      const r = run.current;
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        r.pose = { ...SUNBURST_REST };
        r.mode = "strike";
        r.strikeSeconds = Math.max(0.2, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        const plan = planSunburst(cue.duration);
        r.plan = plan;
        r.mode = "burst";
        r.flecked = false;
        r.start = now();
        // Dust in the air catches the sunlight and drifts up, gold, while it blazes.
        motes.current?.emit({
          motion: "rise",
          origin: new Vector3(0, PEDESTAL_TOP + 0.1, 0),
          duration: plan.total,
          color: MOTE,
          color2: spell.visualEffect.palette.glow,
          size: 0.02,
        });
      }
    },
    reset: () => {
      const r = run.current;
      motes.current?.stop(0.4);
      if (r.mode === "rest" || r.mode === "return") return;
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the vines grown and unlit if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) applyPose(findParts(group), SUNBURST_REST, 0);
    },
    [rig],
  );

  useFrame((state) => {
    const r = run.current;
    const t = now() - r.start;
    let pose: SunburstPose = SUNBURST_REST;

    switch (r.mode) {
      case "strike": {
        // The light touches them: a startled shiver.
        const k = t / r.strikeSeconds;
        if (k >= 1) r.mode = "rest";
        else if (!r.reducedMotion)
          pose = { ...SUNBURST_REST, shiver: 0.6 * Math.sin(Math.PI * k) };
        break;
      }
      case "burst": {
        if (!r.plan) break;
        const plan = r.plan;
        pose = sunburstPose(plan, t, r.reducedMotion);
        // Dry flecks puff out of the pot as the leaves fall in, and the motes fade with the light.
        if (!r.flecked && t >= plan.retreatAt + plan.retreat * 0.45) {
          r.flecked = true;
          motes.current?.stop(plan.fadeAt + plan.fade - t);
          if (!r.reducedMotion)
            flecks.current?.emit({
              motion: "puff",
              origin: new Vector3(0, PEDESTAL_TOP + 0.21, 0),
              duration: 1.4,
              color: FLECK,
              color2: MOTE,
              size: 0.016,
            });
        }
        // Finished: they stay withered back under a warm glow until the next cast.
        if (t >= plan.total) r.mode = "withered";
        break;
      }
      case "withered":
        pose = SUNBURST_WITHERED;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, SUNBURST_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const time = now();
    const group = rig.targetGroup.current;
    if (group && parts.current?.group !== group) parts.current = findParts(group);
    if (parts.current) applyPose(parts.current, pose, time);

    // Without bloom the light has no halo to carry it, so it needs more body.
    const boost = quality.postprocessing.bloom ? 1 : 1.5;
    const sun = sunMesh.current;
    if (sun) {
      const material = sun.material as ShaderMaterial;
      const strength = pose.sun * intensity * boost;
      sun.visible = strength > 0.003;
      sun.quaternion.copy(state.camera.quaternion);
      // As the rays die it sinks to the pot and shrinks to a small warm glow.
      const high = pose.rays;
      sun.position.set(
        GLOW_AT[0] + (SUN_AT[0] - GLOW_AT[0]) * high,
        GLOW_AT[1] + (SUN_AT[1] - GLOW_AT[1]) * high,
        GLOW_AT[2] + (SUN_AT[2] - GLOW_AT[2]) * high,
      );
      sun.scale.setScalar(0.45 + 0.55 * high);
      material.uniforms.uSun!.value = strength;
      material.uniforms.uRays!.value = pose.rays;
      material.uniforms.uSpin!.value = r.reducedMotion ? 0 : time * 0.25;
    }
    const pool = poolMesh.current;
    if (pool) {
      const strength = pose.sun * intensity * boost;
      pool.visible = strength > 0.003;
      (pool.material as ShaderMaterial).uniforms.uPool!.value = strength;
    }

    rig.setOutcomeAmount(witheredAmount(pose));
  });

  return (
    <group>
      <mesh ref={sunMesh} position={[...SUN_AT]} visible={false} renderOrder={3}>
        <planeGeometry args={[SUN_SIZE, SUN_SIZE]} />
        <shaderMaterial
          vertexShader={QUAD_VERTEX}
          fragmentShader={SUN_FRAGMENT}
          uniforms={uniforms.sun}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={poolMesh}
        position={[0, PEDESTAL_TOP + 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={2}
      >
        <planeGeometry args={[POOL_SIZE, POOL_SIZE]} />
        <shaderMaterial
          vertexShader={QUAD_VERTEX}
          fragmentShader={POOL_FRAGMENT}
          uniforms={uniforms.pool}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <SpellParticles
        count={Math.max(24, Math.round(quality.particleBudget * 0.03))}
        seed={601}
        handleRef={motes}
      />
      <SpellParticles
        count={Math.max(16, Math.round(quality.particleBudget * 0.02))}
        seed={607}
        handleRef={flecks}
      />
    </group>
  );
}
