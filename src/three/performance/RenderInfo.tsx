import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/** What the renderer drew in the last complete frame, including post-processing passes. */
export interface FrameInfo {
  drawCalls: number;
  triangles: number;
}

/** Shared by DevStats and SceneProbe; RenderInfo writes it once per frame. */
export const lastFrame: FrameInfo = { drawCalls: 0, triangles: 0 };

/**
 * By default three.js resets its counters on every render call, so with
 * post-processing only the last pass would show. This turns that off and
 * resets once per frame instead, before the frame renders.
 */
export function RenderInfo() {
  const getState = useThree((state) => state.get);

  useEffect(() => {
    const { info } = getState().gl;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [getState]);

  useFrame(({ gl }) => {
    lastFrame.drawCalls = gl.info.render.calls;
    lastFrame.triangles = gl.info.render.triangles;
    gl.info.reset();
  });

  return null;
}
