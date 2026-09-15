import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Vector3,
  type PerspectiveCamera,
  type Points,
  type ShaderMaterial,
} from "three";
import { createRandom } from "../utils/random";

/*
 * One GPU particle system, four motions. Every particle's position is a pure
 * function of time in the vertex shader, so a burst of hundreds of sparks
 * costs one draw call and no per-particle JavaScript.
 */

export type ParticleMotion = "converge" | "burst" | "orbit" | "rise" | "puff";

const MOTION_INDEX: Record<ParticleMotion, number> = {
  converge: 0,
  burst: 1,
  orbit: 2,
  rise: 3,
  puff: 4,
};

export interface ParticleEmission {
  motion: ParticleMotion;
  /** A fixed point, or a function read every frame (e.g. the moving wand tip). */
  origin: Vector3 | ((out: Vector3) => Vector3);
  duration: number;
  color: string;
  color2?: string;
  /** World-space particle size in metres. */
  size: number;
}

export interface ParticleHandle {
  emit(emission: ParticleEmission): void;
  /** Fade out over `fade` seconds (0 = immediately). */
  stop(fade?: number): void;
}

const VERTEX = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSeed;
  uniform int uMotion;
  uniform float uTime;
  uniform float uDuration;
  uniform float uFade;
  uniform float uSize;
  uniform float uProjectionScale;
  uniform vec3 uOrigin;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 p = uOrigin;
    float a = 1.0;
    float t = clamp(uTime / max(uDuration, 0.001), 0.0, 1.0);

    if (uMotion == 0) {
      // Converge: motes drawn inward to a point, staggered.
      float local = clamp(t * 1.35 - aSeed * 0.35, 0.0, 1.0);
      p += aDir * mix(0.26 + aSeed * 0.22, 0.0, local * local);
      a = smoothstep(0.0, 0.2, local) * (1.0 - smoothstep(0.9, 1.0, local));
    } else if (uMotion == 1) {
      // Burst: flung outward, slowing, falling, fading.
      float s = uTime;
      float speed = 1.1 + aSeed * 1.7;
      p += aDir * speed * s * (1.0 - min(s, 1.0) * 0.6);
      p.y -= 0.8 * s * s;
      a = 1.0 - smoothstep(0.0, uDuration, s);
    } else if (uMotion == 2) {
      // Orbit: a slow ring of twinkling light around the target.
      float angle = uTime * (0.8 + aSeed) + aSeed * 6.2831;
      float radius = 0.28 + aSeed * 0.32;
      p += vec3(cos(angle) * radius, aDir.y * 0.45 + sin(uTime * 1.7 + aSeed * 20.0) * 0.04, sin(angle) * radius);
      a = smoothstep(0.0, 0.35, uTime) * (0.5 + 0.5 * sin(uTime * 6.0 + aSeed * 40.0));
    } else if (uMotion == 3) {
      // Rise: embers or smoke drifting up and fading.
      float h = fract(uTime * (0.22 + aSeed * 0.35) + aSeed);
      p += vec3(aDir.x * 0.26 + sin(uTime + aSeed * 9.0) * 0.05, h * 1.1, aDir.z * 0.26);
      a = sin(h * 3.14159) * smoothstep(0.0, 0.4, uTime);
    } else {
      // Puff: dust pushed out low and slow from under something landing.
      float spread = (1.0 - exp(-3.5 * uTime)) * (0.18 + aSeed * 0.3);
      vec2 ground = normalize(aDir.xz + vec2(0.0001));
      p += vec3(ground.x * spread, abs(aDir.y) * spread * 0.25 + uTime * 0.03, ground.y * spread);
      a = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.05, uTime);
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * (0.6 + aSeed * 0.8) * uProjectionScale / -mv.z);
    vAlpha = a * uFade;
    vSeed = aSeed;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = (1.0 - smoothstep(0.0, 0.5, d));
    float a = core * core * vAlpha;
    if (a < 0.01) discard;
    vec3 color = mix(uColor, uColor2, vSeed) * (1.0 + core);
    gl_FragColor = vec4(color * a, a);
  }
`;

/** Scratch vector for reading moving origins; used synchronously, so instances can share it. */
const scratch = new Vector3();

function buildGeometry(count: number, seed: number) {
  const random = createRandom(seed);
  const dirs = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const v = new Vector3();
  for (let i = 0; i < count; i++) {
    // Uniform directions on a sphere.
    const u = random.range(-1, 1);
    const theta = random.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - u * u);
    v.set(r * Math.cos(theta), u, r * Math.sin(theta));
    dirs.set([v.x, v.y, v.z], i * 3);
    seeds[i] = random.next();
  }
  const geometry = new BufferGeometry();
  // Positions are computed in the shader; three still needs a position attribute.
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute("aDir", new Float32BufferAttribute(dirs, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  return geometry;
}

export function SpellParticles({
  count,
  seed,
  handleRef,
}: {
  count: number;
  seed: number;
  handleRef: RefObject<ParticleHandle | null>;
}) {
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const run = useRef({
    active: false,
    time: 0,
    fade: 1,
    fadeRate: 0,
    origin: null as ParticleEmission["origin"] | null,
  });

  const geometry = useMemo(() => buildGeometry(Math.max(1, count), seed), [count, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uMotion: { value: 0 },
      uTime: { value: 0 },
      uDuration: { value: 1 },
      uFade: { value: 1 },
      uSize: { value: 0.02 },
      uProjectionScale: { value: 1000 },
      uOrigin: { value: new Vector3() },
      uColor: { value: new Color() },
      uColor2: { value: new Color() },
    }),
    [],
  );

  useEffect(() => {
    handleRef.current = {
      emit(emission) {
        // Read the material through the points object: the frame loop owns the material ref.
        const u = (points.current?.material as ShaderMaterial | undefined)?.uniforms;
        if (!u || !points.current) return;
        u.uMotion!.value = MOTION_INDEX[emission.motion];
        u.uDuration!.value = emission.duration;
        u.uSize!.value = emission.size;
        (u.uColor!.value as Color).set(emission.color);
        (u.uColor2!.value as Color).set(emission.color2 ?? emission.color);
        run.current.active = true;
        run.current.time = 0;
        run.current.fade = 1;
        run.current.fadeRate = 0;
        run.current.origin = emission.origin;
        points.current.visible = true;
      },
      stop(fade = 0) {
        if (!run.current.active) return;
        if (fade <= 0) {
          run.current.active = false;
          if (points.current) points.current.visible = false;
        } else {
          run.current.fadeRate = 1 / fade;
        }
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  useFrame((state, delta) => {
    const r = run.current;
    const u = material.current?.uniforms;
    if (!r.active || !u || !points.current) return;
    r.time += delta;
    if (r.fadeRate > 0) {
      r.fade -= r.fadeRate * delta;
      if (r.fade <= 0) {
        r.active = false;
        points.current.visible = false;
        return;
      }
    }
    const origin = r.origin;
    if (origin) {
      (u.uOrigin!.value as Vector3).copy(
        typeof origin === "function" ? origin(scratch) : origin,
      );
    }
    const camera = state.camera as PerspectiveCamera;
    u.uProjectionScale!.value =
      (state.size.height * state.viewport.dpr) /
      2 /
      Math.tan((camera.fov * Math.PI) / 360);
    u.uTime!.value = r.time;
    u.uFade!.value = r.fade;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
