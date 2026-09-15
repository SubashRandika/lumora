import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import {
  blendPoseToRest,
  burntAmount,
  IGNITE_BURNT,
  IGNITE_REST,
  ignitePose,
  planIgnite,
  type IgnitePlan,
  type IgnitePose,
} from "@/domain/casting/outcomes";
import type { ScorchUniforms } from "../../materials/scorch";
import { CLOAK_PARTS } from "../../objects/targets";
import { SpellParticles, type ParticleHandle } from "../../particles/SpellParticles";
import { useCastRig, usePerformer } from "../CastRig";
import type { OutcomeProps } from "./TargetOutcome";

/** Seconds to restore the cloak: on the next cast, a cancel, or a reset. */
const RETURN_SECONDS = 0.8;
/** How far the flames stand off the cloth, in metres. */
const FLAME_PUSH = 0.025;
const FLOOR_SIZE = 3.2;
const HOT = "#ffd98a";
const MID = "#ffa03a";
const COOL = "#d8401a";
const EMBER = "#ff8a3a";
const SMOKE = "#5c5a60";

type Mode = "rest" | "strike" | "burn" | "burnt" | "return";

const now = () => performance.now() / 1000;

/*
 * Flames: a copy of each piece of cloth pushed out along its normals, drawn
 * additively. Noise scrolls upward through world space so tongues of fire
 * lick above the climbing front, thinning out behind it. All GLSL stays
 * defined on real GPUs: no pow() of negatives and smoothstep edges in
 * ascending order.
 */
const FLAME_VERTEX = /* glsl */ `
  uniform float uPush;
  varying vec3 vPos;
  void main() {
    // Cloth normals may face in or out (the cloak is a two-sided lathe), so push
    // away from the stand's vertical axis either way.
    vec3 radial = vec3(position.x, 0.0, position.z);
    vec3 outward = dot(normal, radial) < 0.0 ? -normal : normal;
    vec4 world = modelMatrix * vec4(position + outward * uPush, 1.0);
    vPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const NOISE = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uFront;
  uniform float uFlame;
  uniform float uEaten;
  uniform float uTime;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    if (vPos.y < uEaten - 0.02) discard;
    // Stretched upward and scrolling, so the noise reads as separate tongues.
    vec3 q = vec3(vPos.x * 11.0, vPos.y * 3.5 - uTime * 3.2, vPos.z * 11.0);
    float n = noise3(q) * 0.55 + noise3(q * 2.3 + 3.7) * 0.3 + noise3(q * 5.1 + 1.3) * 0.15;
    float above = vPos.y - uFront;
    float tongue = 0.06 + 0.34 * n * n;
    float top = 1.0 - smoothstep(-0.02, tongue, above);
    // Behind the front the fire thins out, still licking along the burning hem.
    float trail = smoothstep(-0.55, -0.05, above);
    float hem = 1.0 - smoothstep(uEaten, uEaten + 0.18, vPos.y);
    float body = top * max(mix(0.1, 1.0, trail), hem * 0.55);
    float mask = smoothstep(0.42, 0.8, n + 0.12 * trail);
    float a = uFlame * body * mask;
    if (a < 0.004) discard;
    // Hottest low in each tongue, reddening toward its tip.
    float tip = smoothstep(-0.05, tongue, above);
    float heat = clamp(mask * (1.0 - tip) * 0.95, 0.0, 1.0);
    vec3 color = mix(uCool, uMid, smoothstep(0.1, 0.5, heat));
    color = mix(color, uHot, smoothstep(0.6, 1.0, heat));
    gl_FragColor = vec4(color * a * 0.85, a);
  }
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Firelight thrown across the floor around the stand: warm, soft, flickering in strength. */
const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLight;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    float a = uLight * exp(-r2 * 3.0) * (1.0 - smoothstep(0.8, 1.0, sqrt(r2))) * 0.7;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

interface CloakParts {
  group: Group;
  cloth: Mesh[];
  scorch: ScorchUniforms | null;
}

function findParts(group: Group): CloakParts {
  const cloth: Mesh[] = [];
  group.traverse((object) => {
    if (object.name === CLOAK_PARTS.cloth) cloth.push(object as Mesh);
  });
  const root = group.getObjectByName(CLOAK_PARTS.root);
  return {
    group,
    cloth,
    scorch: (root?.userData.scorch as ScorchUniforms | undefined) ?? null,
  };
}

/** Chars and burns the cloth to `pose`. */
function applyScorchPose(parts: CloakParts, pose: IgnitePose, time: number) {
  const { scorch } = parts;
  if (!scorch) return;
  scorch.uScorchLine.value = pose.front;
  scorch.uChar.value = pose.char;
  scorch.uEaten.value = pose.eaten;
  scorch.uEmbers.value = pose.embers;
  scorch.uFlicker.value = pose.flicker;
  scorch.uScorchTime.value = time;
}

/**
 * The ignite outcome, on the cloak: a flame catches at the hem, climbs the
 * cloak for the spell's `flameSeconds` with embers rising and firelight
 * flickering across the floor, charring the cloth and eating the hem away, then
 * dies down in a curl of smoke. The cloak stays charred, its burnt hem glowing
 * with embers and a thin wisp of smoke rising, until the next cast (or a
 * cancel) restores it before the spell lands. Motion is sampled from the pure
 * plan in `domain/casting/outcomes.ts`.
 */
export function Ignition({ quality }: OutcomeProps) {
  const rig = useCastRig();
  const holder = useRef<Group>(null);
  const floorMesh = useRef<Mesh>(null);
  const embers = useRef<ParticleHandle>(null);
  const smoke = useRef<ParticleHandle>(null);

  // Shared by every flame shell; created once and read through a ref in the frame loop.
  const flame = useRef<ShaderMaterial | null>(null);
  useEffect(() => {
    const material = new ShaderMaterial({
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      uniforms: {
        uPush: { value: FLAME_PUSH },
        uFront: { value: 0 },
        uFlame: { value: 0 },
        uEaten: { value: 0 },
        uTime: { value: 0 },
        uHot: { value: new Color(HOT) },
        uMid: { value: new Color(MID) },
        uCool: { value: new Color(COOL) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    flame.current = material;
    return () => {
      flame.current = null;
      material.dispose();
    };
  }, []);
  const floorUniforms = useMemo(
    () => ({ uColor: { value: new Color(MID) }, uLight: { value: 0 } }),
    [],
  );

  const run = useRef({
    mode: "rest" as Mode,
    start: 0,
    strikeSeconds: 0.3,
    plan: null as IgnitePlan | null,
    reducedMotion: false,
    smoking: false,
    /** The flames' own clock: slowed with reduced motion so they drift rather than flicker. */
    fireTime: 0,
    last: now(),
    pose: { ...IGNITE_REST } as IgnitePose,
    from: { ...IGNITE_REST } as IgnitePose,
  });
  const parts = useRef<CloakParts | null>(null);
  const shells = useRef<Mesh[]>([]);

  usePerformer(() => ({
    id: "outcome",
    perform: (cue) => {
      if (cue.spell.visualEffect.outcome.kind !== "ignite") return;
      const r = run.current;
      r.reducedMotion = cue.reducedMotion;
      if (cue.phase === "impact") {
        r.pose = { ...IGNITE_REST };
        r.mode = "strike";
        r.strikeSeconds = Math.max(0.2, cue.duration);
        r.start = now();
      } else if (cue.phase === "effect") {
        const plan = planIgnite(cue.spell.visualEffect.outcome, cue.duration);
        r.plan = plan;
        r.mode = "burn";
        r.smoking = false;
        r.start = now();
        embers.current?.emit({
          motion: "rise",
          origin: new Vector3(0, 0.5, 0.05),
          duration: plan.dieAt,
          color: EMBER,
          color2: HOT,
          size: 0.022,
        });
      }
    },
    reset: () => {
      const r = run.current;
      embers.current?.stop(0.3);
      smoke.current?.stop(RETURN_SECONDS);
      r.smoking = false;
      if (r.mode === "rest" || r.mode === "return") return;
      r.from = { ...r.pose };
      r.mode = "return";
      r.start = now();
    },
  }));

  // Leave the cloak whole if this outcome unmounts (e.g. switching spells).
  useEffect(
    () => () => {
      rig.setOutcomeAmount(0);
      const group = rig.targetGroup.current;
      if (group) applyScorchPose(findParts(group), IGNITE_REST, 0);
    },
    [rig],
  );

  // Remove the flame shells on unmount; their geometry belongs to the cloth.
  useEffect(
    () => () => {
      for (const shell of shells.current) shell.removeFromParent();
      shells.current = [];
    },
    [],
  );

  useFrame(() => {
    const r = run.current;
    const clock = now();
    const t = clock - r.start;
    r.fireTime += (clock - r.last) * (r.reducedMotion ? 0.3 : 1);
    r.last = clock;
    let pose: IgnitePose = IGNITE_REST;

    switch (r.mode) {
      case "strike": {
        // The fireball lands: the hem glows hot for a moment.
        const k = t / r.strikeSeconds;
        if (k >= 1) r.mode = "rest";
        else pose = { ...IGNITE_REST, embers: 0.6 * Math.sin(Math.PI * k) };
        break;
      }
      case "burn": {
        if (!r.plan) break;
        const plan = r.plan;
        pose = ignitePose(plan, t, r.reducedMotion);
        // Smoke curls up as the flames die, and a thin wisp keeps rising after.
        if (!r.smoking && t >= plan.dieAt) {
          r.smoking = true;
          smoke.current?.emit({
            motion: "rise",
            origin: new Vector3(0, 0.75, 0),
            duration: 1,
            color: SMOKE,
            color2: "#3e3c42",
            size: 0.07,
          });
        }
        // Finished: it stays charred and smouldering until the next cast.
        if (t >= plan.total) r.mode = "burnt";
        break;
      }
      case "burnt":
        pose = IGNITE_BURNT;
        break;
      case "return": {
        const k = t / RETURN_SECONDS;
        if (k >= 1) r.mode = "rest";
        else pose = blendPoseToRest(r.from, IGNITE_REST, k);
        break;
      }
      default:
        break;
    }
    r.pose = pose;

    const group = rig.targetGroup.current;
    const flameMaterial = flame.current;
    if (!flameMaterial) return;
    if (group && parts.current?.group !== group) {
      parts.current = findParts(group);
      // One flame shell per piece of cloth, sharing its geometry.
      for (const shell of shells.current) shell.removeFromParent();
      shells.current = parts.current.cloth.map((cloth) => {
        const shell = new Mesh(cloth.geometry, flameMaterial);
        shell.matrixAutoUpdate = false;
        shell.frustumCulled = false;
        shell.renderOrder = 2;
        holder.current?.add(shell);
        return shell;
      });
    }
    if (parts.current) {
      applyScorchPose(parts.current, pose, r.fireTime);
      parts.current.cloth.forEach((cloth, i) => {
        const shell = shells.current[i];
        if (!shell) return;
        cloth.updateWorldMatrix(true, false);
        shell.matrix.copy(cloth.matrixWorld);
        shell.visible = pose.flame > 0.003;
      });
    }

    // Without bloom the fire has no halo to carry it, so it needs more body.
    const boost = quality.postprocessing.bloom ? 1 : 1.4;
    const u = flameMaterial.uniforms;
    u.uFront!.value = pose.front;
    u.uFlame!.value = pose.flame * boost;
    u.uEaten!.value = pose.eaten;
    u.uTime!.value = r.fireTime;

    const floor = floorMesh.current;
    if (floor) {
      const flicker =
        1 -
        pose.flicker *
          0.3 *
          (0.5 + 0.5 * Math.sin(clock * 17.3) * Math.sin(clock * 7.1 + 0.6));
      const light = (pose.flame * flicker + pose.embers * 0.06) * boost;
      floor.visible = light > 0.003;
      (floor.material as ShaderMaterial).uniforms.uLight!.value = light;
    }

    rig.setOutcomeAmount(burntAmount(pose));
  });

  return (
    <group>
      <group ref={holder} />
      <mesh
        ref={floorMesh}
        position={[0, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={2}
      >
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <shaderMaterial
          vertexShader={QUAD_VERTEX}
          fragmentShader={FLOOR_FRAGMENT}
          uniforms={floorUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <SpellParticles
        count={Math.max(24, Math.round(quality.particleBudget * 0.04))}
        seed={701}
        handleRef={embers}
      />
      <SpellParticles
        count={Math.max(12, Math.round(quality.particleBudget * 0.015))}
        seed={709}
        handleRef={smoke}
      />
    </group>
  );
}
