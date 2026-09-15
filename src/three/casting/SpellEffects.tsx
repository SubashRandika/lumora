import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
  type Sprite,
} from "three";
import type { QualityProfile } from "@/config/performance";
import type { PhaseCue } from "@/domain/casting/engine.types";
import { outcomeReleaseAt } from "@/domain/casting/outcomes";
import type { ProjectileDefinition, SpellDefinition } from "@/domain/spells/spell.schema";
import {
  SpellParticles,
  type ParticleHandle,
  type ParticleMotion,
} from "../particles/SpellParticles";
import { ProjectileTrail } from "../particles/ProjectileTrail";
import { getGlowTexture } from "../utils/glowTexture";
import { useCastRig, usePerformer } from "./CastRig";
import { gsap } from "./gsap";

const UP = new Vector3(0, 1, 0);
/** Metres past the wand tip where beams begin. */
const BEAM_START_OFFSET = 0.6;
const EMBER = "#ff9a4a";
const SMOKE = "#7a7f8a";

type LightAnchor = "off" | "tip" | "projectile" | "target";

interface ProjectileRun {
  active: boolean;
  kind: ProjectileDefinition["kind"];
  trail: boolean;
  size: number;
  elapsed: number;
  duration: number;
  from: Vector3;
  to: Vector3;
  control: Vector3;
}

/** Which ambient particle motions a spell's `particles` list asks for during its effect. */
export function effectMotions(
  particles: SpellDefinition["visualEffect"]["particles"],
): Array<{ motion: ParticleMotion; tint?: string }> {
  const motions: Array<{ motion: ParticleMotion; tint?: string }> = [];
  if (particles.some((p) => p === "sparkles" || p === "energy" || p === "magic-trail")) {
    motions.push({ motion: "orbit" });
  }
  if (particles.includes("embers")) motions.push({ motion: "rise", tint: EMBER });
  else if (particles.includes("smoke")) motions.push({ motion: "rise", tint: SMOKE });
  return motions;
}

/**
 * The visible magic: energy gathering at the wand, the projectile and its
 * trail, the impact burst and flash, and light lingering around the target.
 * One performer; all motion in `useFrame` or shaders.
 */
export function SpellEffects({ quality }: { quality: QualityProfile }) {
  const rig = useCastRig();
  const budget = quality.particleBudget;

  const charge = useRef<ParticleHandle>(null);
  const burst = useRef<ParticleHandle>(null);
  const aura = useRef<ParticleHandle>(null);
  const rise = useRef<ParticleHandle>(null);

  const head = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const halo = useRef<Sprite>(null);
  const light = useRef<PointLight>(null);

  const glowTexture = getGlowTexture();

  // Animated scalars. GSAP tweens these; the frame loop reads them.
  const levels = useRef({ light: 0, halo: 0, flash: 0 });
  const anchor = useRef<LightAnchor>("off");
  const color = useRef(new Color());
  const projectile = useRef<ProjectileRun>({
    active: false,
    kind: "magic-orb",
    trail: false,
    size: 0.1,
    elapsed: 0,
    duration: 1,
    from: new Vector3(),
    to: new Vector3(),
    control: new Vector3(),
  });
  const scratch = useMemo(
    () => ({ a: new Vector3(), b: new Vector3(), c: new Vector3() }),
    [],
  );
  const pending = useRef<gsap.core.Tween[]>([]);

  const hasLight = quality.maxDynamicLights >= 3;

  usePerformer(() => {
    const tipOrigin = (out: Vector3) => rig.getWandTipPosition(out);

    const reset = () => {
      gsap.killTweensOf(levels.current);
      Object.assign(levels.current, { light: 0, halo: 0, flash: 0 });
      anchor.current = "off";
      projectile.current.active = false;
      for (const call of pending.current) call.kill();
      pending.current = [];
      for (const handle of [charge, burst, aura, rise]) handle.current?.stop(0);
    };

    const perform = (cue: PhaseCue) => {
      const { visualEffect } = cue.spell;
      const { core: coreColor, glow } = visualEffect.palette;
      color.current.set(glow);
      const d = cue.duration;

      switch (cue.phase) {
        case "casting": {
          charge.current?.emit({
            motion: "converge",
            origin: tipOrigin,
            duration: d * 0.95,
            color: coreColor,
            color2: glow,
            size: 0.012,
          });
          anchor.current = "tip";
          gsap.to(levels.current, { light: 0.8, duration: d, ease: "power1.in" });
          break;
        }
        case "projectile": {
          charge.current?.stop(0.15);
          const def = visualEffect.projectile;
          if (!def || d <= 0) break;
          const run = projectile.current;
          rig.getWandTipPosition(run.from);
          run.to.copy(rig.targetFocus);
          run.control
            .copy(run.from)
            .lerp(run.to, 0.5)
            .add(scratch.a.set(0, def.kind === "spark" ? 0.15 : 0.35, 0));
          Object.assign(run, {
            active: true,
            kind: def.kind,
            trail: def.trail,
            size: def.size,
            elapsed: 0,
            duration: d,
          });
          anchor.current = "projectile";
          break;
        }
        case "impact": {
          projectile.current.active = false;

          charge.current?.stop(0.1);
          burst.current?.emit({
            motion: "burst",
            origin: rig.targetFocus.clone(),
            duration: Math.max(0.8, d + 0.6),
            color: coreColor,
            color2: glow,
            size: 0.022,
          });
          anchor.current = "target";
          gsap.killTweensOf(levels.current);
          gsap.fromTo(
            levels.current,
            { flash: 1 },
            { flash: 0, duration: 0.55, ease: "power2.out" },
          );
          gsap.to(levels.current, {
            light: 1.6,
            halo: 1,
            duration: 0.12,
            ease: "power2.out",
          });
          break;
        }
        case "effect": {
          const release = outcomeReleaseAt(visualEffect.outcome, d);
          const lingering = effectMotions(visualEffect.particles);
          lingering.forEach(({ motion, tint }) => {
            const handle = motion === "orbit" ? aura : rise;
            handle.current?.emit({
              motion,
              // Follows the target if its outcome moves it.
              origin: rig.getTargetPosition,
              duration: d,
              color: tint ?? coreColor,
              color2: tint ?? glow,
              size: motion === "rise" ? 0.028 : 0.018,
            });
          });
          gsap.to(levels.current, {
            light: 0.35,
            duration: Math.min(d * 0.3, release),
            ease: "power1.out",
          });
          gsap.to(levels.current, {
            light: 0,
            halo: 0,
            duration: d - release,
            delay: release,
            ease: "sine.inOut",
            onComplete: () => {
              anchor.current = "off";
            },
          });
          pending.current.push(
            gsap.delayedCall(Math.max(0, d - 0.6), () => {
              aura.current?.stop(0.6);
              rise.current?.stop(0.6);
            }),
          );

          break;
        }
        default:
          break;
      }
    };

    return { id: "effects", perform, reset };
  });

  useFrame((state, delta) => {
    const run = projectile.current;
    const { a, b } = scratch;

    // Projectile head and beam.
    if (head.current && core.current && beam.current) {
      head.current.visible = run.active;
      beam.current.visible = false;
      if (run.active) {
        run.elapsed += delta;
        const t = Math.min(1, run.elapsed / Math.max(0.001, run.duration));
        const isBeam = run.kind === "ray" || run.kind === "energy-beam";

        if (isBeam) {
          // Start a little beyond the tip: the wand sits so close to the camera that
          // a beam drawn from the tip itself fills the screen.
          const direction = scratch.c.copy(run.to).sub(run.from).normalize();
          a.copy(run.from).addScaledVector(direction, BEAM_START_OFFSET);
          const reach = Math.min(1, t / 0.55);
          b.copy(a).lerp(run.to, reach);
          const length = a.distanceTo(b);
          const pulse = 1 + 0.2 * Math.sin(state.clock.elapsedTime * 40);
          const width = run.size * (run.kind === "energy-beam" ? 0.14 : 0.06) * pulse;
          beam.current.visible = length > 0.001;
          beam.current.position.copy(a).lerp(b, 0.5);
          beam.current.quaternion.setFromUnitVectors(UP, direction);
          beam.current.scale.set(width, length, width);
          (beam.current.material as MeshBasicMaterial).color.copy(color.current);
          head.current.position.copy(b);
          core.current.scale.setScalar(run.size * 0.3);
        } else {
          // Eased quadratic Bézier arc from tip to target; sparks jitter.
          const e = t * t * (3 - 2 * t);
          const u = 1 - e;
          head.current.position
            .copy(run.from)
            .multiplyScalar(u * u)
            .add(a.copy(run.control).multiplyScalar(2 * u * e))
            .add(b.copy(run.to).multiplyScalar(e * e));
          if (run.kind === "spark") {
            const jitter = 0.03 * Math.sin(state.clock.elapsedTime * 55);
            head.current.position.x += jitter;
            head.current.position.y += jitter * 0.6;
          }
          core.current.scale.setScalar(
            run.size * (0.9 + 0.15 * Math.sin(state.clock.elapsedTime * 25)),
          );
        }
        (core.current.material as MeshBasicMaterial).color.copy(color.current);
      }
    }

    // Halo and flash at the target.
    const lv = levels.current;
    if (halo.current) {
      const opacity = lv.halo * 0.45 + lv.flash * 0.9;
      halo.current.visible = opacity > 0.01;
      rig.getTargetPosition(halo.current.position);
      halo.current.scale.setScalar(
        0.9 + lv.flash * 1.6 + 0.05 * Math.sin(state.clock.elapsedTime * 3),
      );
      halo.current.material.opacity = opacity;
      halo.current.material.color.copy(color.current);
    }

    // The single moving spell light.
    if (light.current) {
      const l = light.current;
      l.color.copy(color.current);
      l.intensity = lv.light * 7 + lv.flash * 14;
      if (anchor.current === "tip") rig.getWandTipPosition(l.position);
      else if (anchor.current === "projectile" && head.current)
        l.position.copy(head.current.position);
      else if (anchor.current === "target")
        rig.getTargetPosition(l.position).add(a.set(0, 0.25, 0.4));
    }
  });

  return (
    <group>
      <SpellParticles count={Math.round(budget * 0.04)} seed={101} handleRef={charge} />
      <ProjectileTrail
        headRef={head}
        activeRef={projectile}
        colorRef={color}
        size={0.05}
        map={glowTexture}
      />
      <SpellParticles count={Math.round(budget * 0.08)} seed={103} handleRef={burst} />
      <SpellParticles count={Math.round(budget * 0.06)} seed={104} handleRef={aura} />
      <SpellParticles count={Math.round(budget * 0.04)} seed={105} handleRef={rise} />

      <group ref={head} visible={false}>
        <mesh ref={core}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
        <sprite scale={0.35}>
          <spriteMaterial
            map={glowTexture}
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      </group>

      <mesh ref={beam} visible={false}>
        {/* Tapers toward the wand (bottom), widest where it lands (top, +Y). */}
        <cylinderGeometry args={[1, 0.35, 1, 12, 1, true]} />
        <meshBasicMaterial
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <sprite ref={halo} visible={false}>
        <spriteMaterial
          map={glowTexture}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {hasLight && <pointLight ref={light} intensity={0} distance={5} decay={1.8} />}
    </group>
  );
}
