import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Vector3, type Group, type Object3D } from "three";
import type { SpellEngine, SpellPerformer } from "@/domain/casting/engine.types";

/**
 * Values that performers animate (usually with GSAP) and scene components read
 * each frame. All are 0 at rest and roughly 0–1 at full strength. Keeping them
 * in one plain object means environment components never import the engine.
 */
export interface ChamberFx {
  candleFlicker: number;
  dustRise: number;
  brighten: number;
  dim: number;
  tremor: number;
  /** Camera leans toward the wand while magic gathers. */
  wandFocus: number;
  /** Camera pushes toward the target as the spell lands. */
  targetFocus: number;
  /** A short camera jolt on impact. */
  shake: number;
}

export const FX_REST: Readonly<ChamberFx> = {
  candleFlicker: 0,
  dustRise: 0,
  brighten: 0,
  dim: 0,
  tremor: 0,
  wandFocus: 0,
  targetFocus: 0,
  shake: 0,
};

export interface CastRig {
  engine: SpellEngine;
  fx: ChamberFx;
  /** Object at the wand tip; read its world position for charge and projectile origin. */
  wandTip: { current: Object3D | null };
  /** The target prop's group, for reactions like pulses. */
  targetGroup: { current: Group | null };
  /** World-space point where spells land on the target at rest. */
  targetFocus: Vector3;
  /** How far an outcome has moved the target from rest (a lifted book). Outcome performers write it. */
  targetOffset: Vector3;
  /**
   * How far the current outcome is from rest: 0 at rest, 1 at its fullest
   * (a book at full height, a door fully open). Outcome performers write it.
   */
  getOutcomeAmount: () => number;
  setOutcomeAmount: (amount: number) => void;
  setTargetFocus: (x: number, y: number, z: number) => void;
  setWandTip: (object: Object3D | null) => void;
  setTargetGroup: (group: Group | null) => void;
  getWandTipPosition: (out: Vector3) => Vector3;
  /** Where the target is now: its focus plus any outcome offset. Lingering effects and the camera follow it. */
  getTargetPosition: (out: Vector3) => Vector3;
  /** Something in the scene is about to move outside a cast (a new target): draw at full rate for a moment. */
  wake: () => void;
  /** Listens for `wake`; returns a function that stops listening. */
  onWake: (listener: () => void) => () => void;
}

export function createCastRig(engine: SpellEngine): CastRig {
  const targetFocus = new Vector3(0, 1.25, 0);
  const wandTip: CastRig["wandTip"] = { current: null };
  const targetGroup: CastRig["targetGroup"] = { current: null };
  const targetOffset = new Vector3();
  let outcomeAmount = 0;
  const wakeListeners = new Set<() => void>();
  return {
    engine,
    fx: { ...FX_REST },
    wandTip,
    targetGroup,
    targetFocus,
    targetOffset,
    getOutcomeAmount: () => outcomeAmount,
    setOutcomeAmount: (amount) => {
      outcomeAmount = amount;
    },
    getTargetPosition: (out) => out.copy(targetFocus).add(targetOffset),
    setTargetFocus: (x, y, z) => {
      targetFocus.set(x, y, z);
    },
    setWandTip: (object) => {
      wandTip.current = object;
    },
    setTargetGroup: (group) => {
      targetGroup.current = group;
    },
    getWandTipPosition: (out) => {
      if (wandTip.current) return wandTip.current.getWorldPosition(out);
      return out.set(0.3, 1.4, 4.6);
    },
    wake: () => {
      for (const listener of wakeListeners) listener();
    },
    onWake: (listener) => {
      wakeListeners.add(listener);
      return () => {
        wakeListeners.delete(listener);
      };
    },
  };
}

const CastRigContext = createContext<CastRig | null>(null);

export function CastRigProvider({
  rig,
  children,
}: {
  rig: CastRig;
  children: ReactNode;
}) {
  return <CastRigContext.Provider value={rig}>{children}</CastRigContext.Provider>;
}

export function useCastRig(): CastRig {
  const rig = useContext(CastRigContext);
  if (!rig) throw new Error("useCastRig must be used inside <CastRigProvider>");
  return rig;
}

/**
 * Registers a performer with the engine for as long as the component is
 * mounted. `create` runs once per mount; performers read live values via refs.
 */
export function usePerformer(create: () => SpellPerformer) {
  const { engine } = useCastRig();
  useEffect(() => engine.registerPerformer(create()), [engine]); // eslint-disable-line react-hooks/exhaustive-deps
}
