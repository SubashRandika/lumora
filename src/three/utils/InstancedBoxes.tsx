import { useLayoutEffect, useRef } from "react";
import type { InstancedMesh } from "three";
import { applyInstances, type InstanceSpec } from "./instances";

interface InstancedBoxesProps {
  specs: readonly InstanceSpec[];
  /** Used when specs carry no per-instance colour. */
  color?: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Unit boxes placed, scaled, and tinted per instance: one draw call for all of them. */
export function InstancedBoxes({
  specs,
  color = "#ffffff",
  roughness = 0.9,
  metalness = 0,
  castShadow = false,
  receiveShadow = false,
}: InstancedBoxesProps) {
  const ref = useRef<InstancedMesh>(null);
  const tinted = specs.some((spec) => spec.color);

  useLayoutEffect(() => {
    if (ref.current) applyInstances(ref.current, specs);
  }, [specs]);

  if (specs.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, specs.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry />
      <meshStandardMaterial
        color={tinted ? "#ffffff" : color}
        roughness={roughness}
        metalness={metalness}
      />
    </instancedMesh>
  );
}
