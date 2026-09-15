import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  type InstancedMesh,
  type PointLight,
  type ShaderMaterial,
} from "three";
import type { QualityProfile } from "@/config/performance";
import { useCastRig } from "../casting/CastRig";
import { SCENE } from "../palette";
import { applyInstances, type InstanceSpec } from "../utils/instances";
import { InstancedBoxes } from "../utils/InstancedBoxes";
import { createRandom } from "../utils/random";

interface CandleStand {
  x: number;
  z: number;
  /** Candles on this stand, as offsets from its top. */
  candles: Array<[number, number]>;
}

const STAND_HEIGHT = 1.25;

/** Iron candle stands in a loose arc behind the pedestal. */
const STANDS: CandleStand[] = [
  {
    x: -2.4,
    z: -1.6,
    candles: [
      [0, 0],
      [-0.12, 0.05],
      [0.11, -0.04],
    ],
  },
  {
    x: 2.5,
    z: -1.4,
    candles: [
      [0, 0],
      [0.12, 0.06],
    ],
  },
  { x: -3.6, z: 1.4, candles: [[0, 0]] },
  {
    x: 3.7,
    z: 1.8,
    candles: [
      [0, 0],
      [-0.1, 0.04],
    ],
  },
];

const FLAME_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  /** 0 at rest; rises when a spell unsettles the air. */
  uniform float uAgitation;
  varying vec2 vUv;
  varying float vFlicker;

  void main() {
    vUv = uv;
    float t = uTime * (5.0 + aSeed * 3.0) + aSeed * 40.0;
    float agitation = 1.0 + uAgitation * 4.0;
    vFlicker = 0.85 + (0.1 * sin(t) + 0.05 * sin(t * 2.7 + 1.3)) * agitation;

    // Billboard: take the instance's centre into view space, then offset the
    // quad in screen-aligned axes so the flame always faces the camera.
    vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 size = vec2(0.09, 0.2 * vFlicker);
    center.xy += position.xy * size;
    center.x += sin(t * 0.7 * agitation) * 0.004 * agitation * (position.y + 0.5);
    gl_Position = projectionMatrix * center;
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  varying vec2 vUv;
  varying float vFlicker;

  void main() {
    // Teardrop: narrower toward the top.
    vec2 p = vUv - vec2(0.5, 0.35);
    p.x *= 1.0 + vUv.y * 1.6;
    float d = length(p * vec2(2.2, 1.2));
    float flame = smoothstep(0.55, 0.0, d);
    float core = smoothstep(0.22, 0.0, d);
    vec3 color = mix(uEdge, uCore, core) * (1.6 + core);
    float alpha = flame * vFlicker;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function buildCandles() {
  const random = createRandom(51);
  const stands: InstanceSpec[] = [];
  const wax: InstanceSpec[] = [];
  const flames: InstanceSpec[] = [];
  for (const stand of STANDS) {
    stands.push(
      {
        position: [stand.x, STAND_HEIGHT / 2, stand.z],
        scale: [0.04, STAND_HEIGHT, 0.04],
      },
      { position: [stand.x, 0.02, stand.z], scale: [0.36, 0.04, 0.36] },
      { position: [stand.x, STAND_HEIGHT, stand.z], scale: [0.38, 0.025, 0.24] },
    );
    for (const [dx, dz] of stand.candles) {
      const height = random.range(0.12, 0.26);
      const x = stand.x + dx;
      const z = stand.z + dz;
      wax.push({
        position: [x, STAND_HEIGHT + 0.012 + height / 2, z],
        scale: [0.045, height, 0.045],
      });
      flames.push({ position: [x, STAND_HEIGHT + height + 0.09, z], scale: [1, 1, 1] });
    }
  }
  return { stands, wax, flames };
}

/**
 * Candle stands, wax, and flames. Flames are one instanced billboard shader;
 * only a few candles get a real (flickering) point light, set by the quality profile.
 */
export function Candles({
  quality,
  reducedMotion,
}: {
  quality: QualityProfile;
  reducedMotion: boolean;
}) {
  const { stands, wax, flames } = useMemo(() => buildCandles(), []);
  const flameRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const lightRefs = useRef<Array<PointLight | null>>([]);
  const { fx } = useCastRig();

  // The key light takes one slot, and the spell light another when the tier allows one;
  // candles share the rest.
  const reserved = quality.maxDynamicLights >= 3 ? 2 : 1;
  const lightCount = Math.max(
    0,
    Math.min(STANDS.length, quality.maxDynamicLights - reserved),
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAgitation: { value: 0 },
      uCore: { value: new Color(SCENE.wandlight) },
      uEdge: { value: new Color(SCENE.candleFlame) },
    }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = flameRef.current;
    if (!mesh) return;
    applyInstances(mesh, flames);
    const seeds = new Float32Array(flames.map((_, i) => ((i * 0.618) % 1) as number));
    mesh.geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  }, [flames]);

  useFrame((state) => {
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime!.value = t;
      materialRef.current.uniforms.uAgitation!.value = fx.candleFlicker;
    }
    const agitation = 1 + fx.candleFlicker * 4;
    lightRefs.current.forEach((light, i) => {
      if (!light) return;
      const flicker = reducedMotion
        ? 1
        : 1 +
          (0.08 * Math.sin(t * 7.1 + i * 2) + 0.05 * Math.sin(t * 13.3 + i)) * agitation;
      light.intensity = 9 * flicker;
    });
  });

  return (
    <group>
      <InstancedBoxes specs={stands} color={SCENE.iron} roughness={0.5} metalness={0.6} />
      {/* Wax: cylinders read better than boxes at this size. */}
      <InstancedCylinders specs={wax} />

      <instancedMesh
        ref={flameRef}
        args={[undefined, undefined, flames.length]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={FLAME_VERTEX}
          fragmentShader={FLAME_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      {STANDS.slice(0, lightCount).map((stand, i) => (
        <pointLight
          key={`${stand.x}:${stand.z}`}
          ref={(light) => {
            lightRefs.current[i] = light;
          }}
          position={[stand.x, STAND_HEIGHT + 0.45, stand.z]}
          color={SCENE.candleFlame}
          intensity={9}
          distance={8}
          decay={1.6}
        />
      ))}
    </group>
  );
}

function InstancedCylinders({ specs }: { specs: readonly InstanceSpec[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (ref.current) applyInstances(ref.current, specs);
  }, [specs]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, specs.length]}>
      <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
      <meshStandardMaterial
        color={SCENE.candleWax}
        emissive={SCENE.candleFlame}
        emissiveIntensity={0.12}
        roughness={0.6}
      />
    </instancedMesh>
  );
}
