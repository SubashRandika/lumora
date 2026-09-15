import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  LatheGeometry,
  MathUtils,
  Vector2,
  type Group,
  type Object3D,
  type Sprite,
} from "three";
import type { PhaseCue } from "@/domain/casting/engine.types";
import { resolveWandPath } from "@/domain/casting/wandPath";
import { useCastRig, usePerformer } from "../casting/CastRig";
import { EASES, gsap, playTimeline } from "../casting/gsap";
import { SCENE } from "../palette";
import { getGlowTexture } from "../utils/glowTexture";

/** Where the wand sits relative to the camera: lower right, pointing into the room. */
const HOLD_POSITION = [0.34, -0.34, -0.72] as const;
const BASE_TILT = { x: -0.9, z: 0.72 };
const WAND_LENGTH = 0.36;
const GLOW_REST = { scale: 0.05, opacity: 0.55 };

/** How far a gesture point (−1..1) turns and moves the wand. */
const GESTURE = { turnX: 0.42, turnZ: 0.55, push: 0.06, jab: 0.1 };

/** A turned-wood profile from butt to tip, as (radius, height) pairs. */
const PROFILE: Array<[number, number]> = [
  [0, 0],
  [0.0105, 0],
  [0.013, 0.012],
  [0.011, 0.03],
  [0.0135, 0.045],
  [0.0105, 0.058],
  [0.0115, 0.085],
  [0.0095, 0.1],
  [0.0082, 0.16],
  [0.0062, 0.25],
  [0.0042, 0.34],
  [0.0025, WAND_LENGTH],
  [0, WAND_LENGTH + 0.004],
];

/**
 * The player's wand, held in view. It eases toward where the pointer aims,
 * and, as a performer, swings through each spell's gesture while its tip
 * gathers light.
 */
export function Wand({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const rig = useCastRig();
  const pivot = useRef<Group>(null);
  const gesture = useRef<Group>(null);
  const glow = useRef<Sprite>(null);
  const tip = useRef<Object3D>(null);

  const geometry = useMemo(
    () =>
      new LatheGeometry(
        PROFILE.map(([r, y]) => new Vector2(r, y)),
        14,
      ),
    [],
  );
  const glowTexture = getGlowTexture();

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Children of the camera only render if the camera is part of the scene graph.
  useEffect(() => {
    scene.add(camera);
    return () => {
      scene.remove(camera);
    };
  }, [camera, scene]);

  useEffect(() => {
    rig.setWandTip(tip.current);
    return () => rig.setWandTip(null);
  }, [rig]);

  usePerformer(() => {
    let timeline: gsap.core.Timeline | null = null;

    const rest = () => {
      timeline?.kill();
      timeline = null;
      const g = gesture.current;
      if (g) {
        gsap.killTweensOf([g.rotation, g.position]);
        g.rotation.set(0, 0, 0);
        g.position.set(0, 0, 0);
      }
      const sprite = glow.current;
      if (sprite) {
        gsap.killTweensOf([sprite.scale, sprite.material]);
        sprite.scale.setScalar(GLOW_REST.scale);
        sprite.material.opacity = GLOW_REST.opacity;
      }
    };

    const build = (cue: PhaseCue): gsap.core.Timeline | null => {
      const g = gesture.current;
      const sprite = glow.current;
      if (!g || !sprite) return null;
      const tl = gsap.timeline({ paused: true });
      const d = cue.duration;

      switch (cue.phase) {
        case "preparing": {
          // Lift slightly, as if raising the wand to cast.
          tl.to(g.rotation, { x: 0.12, duration: d, ease: "sine.out" }, 0);
          tl.to(g.position, { y: 0.015, duration: d, ease: "sine.out" }, 0);
          break;
        }
        case "casting": {
          const charge = d * 0.5;
          const swing = d - charge;
          // Energy gathers at the tip.
          tl.to(
            sprite.scale,
            { x: 0.13, y: 0.13, duration: charge, ease: "power1.in" },
            0,
          );
          tl.to(sprite.material, { opacity: 1, duration: charge * 0.6 }, 0);
          if (!cue.reducedMotion) {
            // Anticipation: draw back, with a slight tremble as power builds.
            tl.to(g.rotation, { x: 0.28, duration: charge * 0.7, ease: "power2.out" }, 0);
            tl.to(
              g.position,
              {
                x: "+=0.002",
                duration: 0.045,
                repeat: Math.max(1, Math.floor((charge * 0.5) / 0.045)),
                yoyo: true,
                ease: "none",
              },
              charge * 0.45,
            );
          }
          // The gesture itself, point by point along the spell's path.
          const points = resolveWandPath(cue.spell.wandMotion);
          const origin = points[0]!;
          const step = swing / Math.max(1, points.length - 1);
          const ease = EASES[cue.spell.wandMotion.easing ?? "ease-in-out"];
          points.forEach((p, i) => {
            const dx = p.x - origin.x;
            const dy = p.y - origin.y;
            const dz = (p.z ?? 0) - (origin.z ?? 0);
            tl.to(
              g.rotation,
              {
                x: -dy * GESTURE.turnX - dz * 0.3,
                z: -dx * GESTURE.turnZ,
                duration: i === 0 ? step * 0.6 : step,
                ease: i === points.length - 1 ? ease : "sine.inOut",
              },
              i === 0 ? charge : ">",
            );
            tl.to(
              g.position,
              {
                x: dx * GESTURE.push,
                y: dy * GESTURE.push,
                z: -dz * GESTURE.jab,
                duration: i === 0 ? step * 0.6 : step,
                ease: "sine.inOut",
              },
              "<",
            );
          });
          break;
        }
        case "projectile": {
          // Release: a flash at the tip, then the wand settles.
          tl.to(
            sprite.scale,
            { x: 0.22, y: 0.22, duration: 0.08, ease: "power2.out" },
            0,
          );
          tl.to(
            sprite.scale,
            { x: GLOW_REST.scale, y: GLOW_REST.scale, duration: Math.max(0.2, d * 0.8) },
            0.08,
          );
          tl.to(sprite.material, { opacity: GLOW_REST.opacity, duration: d }, 0.08);
          tl.to(
            g.rotation,
            { x: 0, z: 0, duration: Math.max(0.3, d), ease: "power2.out" },
            0.05,
          );
          tl.to(
            g.position,
            { x: 0, y: 0, z: 0, duration: Math.max(0.3, d), ease: "power2.out" },
            0.05,
          );
          break;
        }
        default:
          return null;
      }
      return tl;
    };

    return {
      id: "wand",
      perform: (cue) => {
        timeline?.kill();
        timeline = build(cue);
        return timeline ? playTimeline(timeline, cue.signal) : undefined;
      },
      reset: rest,
    };
  });

  useFrame((state, delta) => {
    const group = pivot.current;
    if (!group) return;
    const idle = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.01;
    const targetX = BASE_TILT.x + state.pointer.y * 0.16 + idle;
    const targetZ = BASE_TILT.z - state.pointer.x * 0.28;
    const lambda = reducedMotion ? 30 : 6;
    group.rotation.x = MathUtils.damp(group.rotation.x, targetX, lambda, delta);
    group.rotation.z = MathUtils.damp(group.rotation.z, targetZ, lambda, delta);
  });

  return createPortal(
    <group position={HOLD_POSITION}>
      <group ref={pivot} rotation={[BASE_TILT.x, 0, BASE_TILT.z]}>
        <group ref={gesture}>
          <mesh geometry={geometry}>
            <meshStandardMaterial
              color={SCENE.woodDark}
              roughness={0.45}
              metalness={0.05}
            />
          </mesh>
          <object3D ref={tip} position={[0, WAND_LENGTH + 0.002, 0]} />
          <mesh position={[0, WAND_LENGTH + 0.002, 0]}>
            <sphereGeometry args={[0.0035, 10, 8]} />
            <meshBasicMaterial color={SCENE.wandlight} toneMapped={false} />
          </mesh>
          <sprite
            ref={glow}
            position={[0, WAND_LENGTH + 0.002, 0]}
            scale={GLOW_REST.scale}
          >
            <spriteMaterial
              map={glowTexture}
              color={SCENE.wandlight}
              transparent
              opacity={GLOW_REST.opacity}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
        </group>
      </group>
    </group>,
    camera,
  );
}
