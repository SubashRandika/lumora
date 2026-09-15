import { useFrame } from "@react-three/fiber";
import { useCastRig } from "../casting/CastRig";
import { lastFrame } from "./RenderInfo";

export interface ChamberProbe {
  /** Metres the target is currently lifted above rest. */
  targetLift?: number;
  /** Highest lift seen since the probe was created or last cleared. */
  maxTargetLift?: number;
  /** How far the current outcome is from rest, 0 to 1 (see `CastRig.getOutcomeAmount`). */
  outcomeAmount?: number;
  /** Highest outcome amount seen since the probe was created or last cleared. */
  maxOutcomeAmount?: number;
  /** Draw calls and triangles in the last complete frame, including post-processing. */
  drawCalls?: number;
  triangles?: number;
  /** Highest counts seen since the probe was created or last cleared. */
  maxDrawCalls?: number;
  maxTriangles?: number;
  /** Frames the chamber has rendered since the probe was created. */
  frames?: number;
}

declare global {
  interface Window {
    __chamberProbe?: ChamberProbe;
  }
}

/**
 * Lets end-to-end tests and measurement scripts observe the scene, which has
 * no DOM. Does nothing unless `window.__chamberProbe` is defined before the page loads.
 */
export function SceneProbe() {
  const rig = useCastRig();
  useFrame(() => {
    const probe = window.__chamberProbe;
    if (!probe) return;
    const lift = rig.targetOffset.y;
    probe.targetLift = lift;
    probe.maxTargetLift = Math.max(probe.maxTargetLift ?? 0, lift);
    const amount = rig.getOutcomeAmount();
    probe.outcomeAmount = amount;
    probe.maxOutcomeAmount = Math.max(probe.maxOutcomeAmount ?? 0, amount);
    probe.drawCalls = lastFrame.drawCalls;
    probe.triangles = lastFrame.triangles;
    probe.maxDrawCalls = Math.max(probe.maxDrawCalls ?? 0, lastFrame.drawCalls);
    probe.maxTriangles = Math.max(probe.maxTriangles ?? 0, lastFrame.triangles);
    probe.frames = (probe.frames ?? 0) + 1;
  });
  return null;
}
