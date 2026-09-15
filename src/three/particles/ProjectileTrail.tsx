import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  type Color,
  type Object3D,
  type Points,
  type Texture,
} from "three";

const LENGTH = 28;

/**
 * A comet tail: the projectile's recent positions, brightest at the head.
 * Fading is encoded in vertex colour, which additive blending turns into
 * transparency. One draw call, 28 points.
 */
export function ProjectileTrail({
  headRef,
  activeRef,
  colorRef,
  size,
  map,
}: {
  headRef: RefObject<Object3D | null>;
  activeRef: RefObject<{ active: boolean; trail: boolean } | null>;
  colorRef: RefObject<Color>;
  size: number;
  map: Texture;
}) {
  const points = useRef<Points>(null);
  const history = useRef({ filled: 0, brightness: 0 });

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(LENGTH * 3), 3),
    );
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(LENGTH * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const p = points.current;
    const head = headRef.current;
    const run = activeRef.current;
    const tint = colorRef.current;
    if (!p || !head || !run || !tint) return;

    const { attributes } = p.geometry;
    const positions = attributes.position!.array as Float32Array;
    const colors = attributes.color!.array as Float32Array;
    const h = history.current;
    const emitting = run.active && run.trail;

    if (emitting) {
      const { x, y, z } = head.position;
      if (h.filled === 0) {
        // Start the whole tail at the head so it doesn't streak from the origin.
        for (let i = 0; i < LENGTH * 3; i += 3) {
          positions[i] = x;
          positions[i + 1] = y;
          positions[i + 2] = z;
        }
      }
      positions.copyWithin(3, 0, (LENGTH - 1) * 3);
      positions[0] = x;
      positions[1] = y;
      positions[2] = z;
      h.filled = Math.min(LENGTH, h.filled + 1);
      h.brightness = 1;
    } else {
      h.brightness *= 0.86;
      if (h.brightness < 0.01) {
        h.filled = 0;
        p.visible = false;
        return;
      }
    }

    for (let i = 0; i < LENGTH; i++) {
      const fade = (1 - i / LENGTH) ** 1.6 * h.brightness;
      colors[i * 3] = tint.r * fade;
      colors[i * 3 + 1] = tint.g * fade;
      colors[i * 3 + 2] = tint.b * fade;
    }
    attributes.position!.needsUpdate = true;
    attributes.color!.needsUpdate = true;
    p.visible = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <pointsMaterial
        map={map}
        size={size}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
