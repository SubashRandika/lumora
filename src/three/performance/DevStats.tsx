import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { lastFrame } from "./RenderInfo";

export interface ChamberStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

declare global {
  interface Window {
    __chamberStats?: ChamberStats;
  }
}

/**
 * Development only (the chamber doesn't render this in production builds).
 * Frame counts come from `RenderInfo`, so they include post-processing passes.
 */
export function DevStats({ outputRef }: { outputRef: RefObject<HTMLElement | null> }) {
  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame(({ gl }, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;

    const stats: ChamberStats = {
      fps: Math.round(frames.current / elapsed.current),
      drawCalls: lastFrame.drawCalls,
      triangles: lastFrame.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };
    window.__chamberStats = stats;
    if (outputRef.current) {
      outputRef.current.textContent = `${stats.fps} fps · ${stats.drawCalls} draw calls · ${(stats.triangles / 1000).toFixed(1)}k triangles`;
    }
    frames.current = 0;
    elapsed.current = 0;
  });

  return null;
}
