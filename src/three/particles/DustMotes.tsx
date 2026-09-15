import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type PerspectiveCamera,
  type ShaderMaterial,
} from "three";
import { useCastRig } from "../casting/CastRig";
import { SCENE } from "../palette";
import { createRandom } from "../utils/random";

const VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  /** Extra height accumulated while a spell lifts the dust. */
  uniform float uRise;
  uniform float uGlow;
  /** Pixels per world unit at distance 1: (drawing-buffer height / 2) / tan(fov / 2). */
  uniform float uProjectionScale;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float t = uTime * (0.08 + aSeed * 0.06);
    // Slow, looping drift: a small orbit plus a gentle rise that wraps.
    p.x += sin(t * 6.2831 + aSeed * 40.0) * 0.18;
    p.z += cos(t * 5.1 + aSeed * 23.0) * 0.18;
    p.y = mod(p.y + uTime * 0.025 * (0.5 + aSeed) + uRise * (0.6 + aSeed) - 0.2, 4.4) + 0.2;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // World-space size of 6–20 mm, projected to pixels.
    gl_PointSize = max(1.0, (0.006 + aSeed * 0.014) * uProjectionScale / -mv.z);

    // Twinkle, and fade motes close to the camera so they never block the view.
    vAlpha = (1.0 + uGlow) * (0.35 + 0.65 * abs(sin(uTime * 0.6 + aSeed * 30.0))) * smoothstep(0.6, 2.0, -mv.z) * (1.0 - smoothstep(5.0, 9.0, -mv.z));
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * 0.55;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * Floating dust in the candlelight. A single Points draw call; all motion
 * happens in the vertex shader, so thousands of motes cost no JavaScript per frame.
 */
export function DustMotes({
  count,
  reducedMotion,
}: {
  count: number;
  reducedMotion: boolean;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const rise = useRef(0);
  const { fx } = useCastRig();

  const geometry = useMemo(() => {
    const random = createRandom(71);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = random.range(-5, 5);
      positions[i * 3 + 1] = random.range(0.2, 4.6);
      positions[i * 3 + 2] = random.range(-4.6, 4);
      seeds[i] = random.next();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
    return g;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRise: { value: 0 },
      uGlow: { value: 0 },
      uProjectionScale: { value: 1000 },
      uColor: { value: new Color(SCENE.wandlight) },
    }),
    [],
  );

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    rise.current += fx.dustRise * delta * 0.9;
    material.uniforms.uRise!.value = rise.current;
    material.uniforms.uGlow!.value = fx.dustRise * 1.5;
    const camera = state.camera as PerspectiveCamera;
    const heightPx = state.size.height * state.viewport.dpr;
    material.uniforms.uProjectionScale!.value =
      heightPx / 2 / Math.tan((camera.fov * Math.PI) / 360);
    if (!reducedMotion) material.uniforms.uTime!.value = state.clock.elapsedTime;
  });

  if (count <= 0) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
