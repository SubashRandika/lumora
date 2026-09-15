"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { ACESFilmicToneMapping, WebGLRenderTarget, type Group } from "three";
import type { QualityProfile } from "@/config/performance";
import type { SpellEngine } from "@/domain/casting/engine.types";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { CameraRig } from "../camera/CameraRig";
import { CastRigProvider, createCastRig, useCastRig } from "../casting/CastRig";
import { TargetOutcome } from "../casting/outcomes/TargetOutcome";
import { CameraMoves, EnvironmentReactions } from "../casting/reactions";
import { SpellEffects } from "../casting/SpellEffects";
import { Bookshelves } from "../environment/Bookshelves";
import { Candles } from "../environment/Candles";
import { Room } from "../environment/Room";
import { ChamberLighting } from "../lighting/ChamberLighting";
import { Pedestal } from "../objects/Pedestal";
import { TARGETS } from "../objects/targets";
import { Wand } from "../objects/Wand";
import { SCENE } from "../palette";
import { DustMotes } from "../particles/DustMotes";
import { DevStats } from "../performance/DevStats";
import { FrameDriver } from "../performance/FrameDriver";
import { RenderInfo } from "../performance/RenderInfo";
import { SceneProbe } from "../performance/SceneProbe";

// Post-processing is a separate chunk that low-tier devices never download.
const ChamberEffects = lazy(() => import("../postprocessing/ChamberEffects"));

export interface MagicChamberProps {
  spell: SpellDefinition;
  quality: QualityProfile;
  reducedMotion: boolean;
  /** Performers inside the scene register with this engine. */
  engine: SpellEngine;
  /** Called once the first frames have rendered and every shader has compiled. */
  onReady: () => void;
  /** Called when the frame rate stays below target (adaptive quality). */
  onPerformanceDecline: () => void;
  /** Called if the browser drops the WebGL context (e.g. GPU reset, memory pressure). */
  onContextLost: () => void;
  /** Development readout of fps and draw calls. */
  statsRef?: RefObject<HTMLElement | null>;
}

const SHOW_DEV_STATS = process.env.NODE_ENV !== "production";

/** Root of the 3D chamber. Loaded only through a dynamic import on chamber routes. */
export default function MagicChamber({
  spell,
  quality,
  reducedMotion,
  engine,
  onReady,
  onPerformanceDecline,
  onContextLost,
  statsRef,
}: MagicChamberProps) {
  const rig = useMemo(() => createCastRig(engine), [engine]);
  const dustCount = Math.floor(quality.particleBudget * 0.35);
  const composer = quality.postprocessing.bloom;

  return (
    <Canvas
      // FrameDriver draws frames itself, so it can slow down while nothing moves.
      frameloop="never"
      // Antialias and the shadow switch are read when the WebGL context is created.
      dpr={[quality.dpr[0], quality.dpr[1]]}
      // "percentage" = PCF shadows (three.js removed the soft variant R3F defaults to).
      shadows={quality.shadows !== "off" ? "percentage" : false}
      gl={{
        // With post-processing the scene is multisampled inside the composer, and
        // the canvas only receives a full-screen quad: its own MSAA buffer would be wasted.
        antialias: quality.antialias && !composer,
        powerPreference: "high-performance",
        stencil: false,
      }}
      camera={{ position: [0, 1.75, 5.4], fov: 45, near: 0.05, far: 40 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.3;
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onContextLost();
        });
      }}
      aria-hidden="true"
    >
      <CastRigProvider rig={rig}>
        <color attach="background" args={[SCENE.ink]} />
        {quality.fog && <fogExp2 attach="fog" args={[SCENE.fog, 0.055]} />}

        <FrameDriver
          idleFrameRate={quality.idleFrameRate}
          onDecline={onPerformanceDecline}
        />

        <ChamberLighting quality={quality} />
        <Room quality={quality} />
        <Bookshelves quality={quality} />
        <Candles quality={quality} reducedMotion={reducedMotion} />
        <DustMotes count={dustCount} reducedMotion={reducedMotion} />

        <Target spell={spell} />

        <Wand reducedMotion={reducedMotion} />
        <CameraRig reducedMotion={reducedMotion} />

        {/* Performers: each registers with the Spell Engine while mounted. */}
        <SpellEffects quality={quality} />
        <TargetOutcome spell={spell} quality={quality} />
        <EnvironmentReactions />
        <CameraMoves />

        {composer && (
          <Suspense fallback={null}>
            <ChamberEffects quality={quality} />
          </Suspense>
        )}

        <ShaderWarmup spellId={spell.id} offscreen={composer} onReady={onReady} />
        <RenderInfo />
        <SceneProbe />
        {SHOW_DEV_STATS && statsRef && <DevStats outputRef={statsRef} />}
      </CastRigProvider>
    </Canvas>
  );
}

/** The pedestal (if the prop needs one) and the spell's target, registered with the rig. */
function Target({ spell }: { spell: SpellDefinition }) {
  const rig = useCastRig();
  const group = useRef<Group>(null);
  const target = TARGETS[spell.target.model];

  useEffect(() => {
    rig.setTargetFocus(...target.focus);
    rig.setTargetGroup(group.current);
    // A new prop may be easing back to rest: draw it at full rate.
    rig.wake();
    return () => rig.setTargetGroup(null);
  }, [rig, target]);

  return (
    <>
      {target.onPedestal && <Pedestal />}
      <group ref={group} key={spell.target.model}>
        <target.Component />
      </group>
    </>
  );
}

/** Frames to draw before compiling: some performers build their meshes on their first frame. */
const WARMUP_FRAMES = 3;
const WARMUP_TIMEOUT_MS = 5000;

/**
 * Compiles every material in the scene, including effects that stay hidden
 * until a cast, so the first cast doesn't stall while shaders compile. Runs
 * after the first frames and again whenever the spell (and its performers)
 * changes; the first time, it then reports the chamber ready.
 *
 * three.js builds a different shader for drawing into a render target (linear
 * output, no tone mapping) than for drawing to the screen. With post-processing
 * the scene draws into the composer's target, so both versions are compiled.
 */
function ShaderWarmup({
  spellId,
  offscreen,
  onReady,
}: {
  spellId: string;
  /** The scene renders into a post-processing target rather than the canvas. */
  offscreen: boolean;
  onReady: () => void;
}) {
  const { gl, scene, camera } = useThree();
  const frames = useRef(0);
  const compiled = useRef<string | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    frames.current = 0;
  }, [spellId]);

  useFrame(() => {
    if (compiled.current === spellId) return;
    frames.current += 1;
    if (frames.current < WARMUP_FRAMES) return;
    compiled.current = spellId;
    const finish = () => {
      if (ready.current) return;
      ready.current = true;
      onReady();
    };

    const pending = [gl.compileAsync(scene, camera)];
    if (offscreen) {
      // compile() reads the bound target synchronously, so it can be swapped straight back.
      const target = new WebGLRenderTarget(1, 1);
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(target);
      pending.push(gl.compileAsync(scene, camera));
      gl.setRenderTarget(previous);
      target.dispose();
    }
    Promise.all(pending).then(finish, finish);
    // Never let a stuck compile hold the loading screen up.
    window.setTimeout(finish, WARMUP_TIMEOUT_MS);
  });

  return null;
}
