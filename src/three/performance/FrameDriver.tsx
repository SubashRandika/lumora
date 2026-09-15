import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ADAPTIVE_QUALITY } from "@/config/performance";
import { isCastPhase } from "@/domain/casting/castMachine";
import {
  createActivityTracker,
  createFrameRateMonitor,
  shouldDrawFrame,
} from "@/domain/performance/framePacing";
import { useCastRig } from "../casting/CastRig";

/** Seconds at full rate after the last input: long enough for the camera and wand to ease to rest. */
const SETTLE_SECONDS = 2.5;

/**
 * Owns the chamber's render loop (the canvas uses `frameloop="never"`). It
 * draws every frame while something moves, drops to `idleFrameRate` at rest,
 * and watches the frame rate while drawing at full speed, calling
 * `onDecline` when it stays too low.
 */
export function FrameDriver({
  idleFrameRate,
  onDecline,
}: {
  idleFrameRate: number;
  onDecline: () => void;
}) {
  const advance = useThree((state) => state.advance);
  const rig = useCastRig();
  const declineRef = useRef(onDecline);
  /** The scene clock's zero, kept across effect restarts so time never runs backwards. */
  const origin = useRef<number | null>(null);

  useEffect(() => {
    declineRef.current = onDecline;
  }, [onDecline]);

  useEffect(() => {
    const seconds = (ms: number) => ms / 1000;
    const monitor = createFrameRateMonitor({
      minFps: ADAPTIVE_QUALITY.minFps,
      windowSeconds: ADAPTIVE_QUALITY.windowSeconds,
    });
    const activity = createActivityTracker(SETTLE_SECONDS, seconds(performance.now()));
    const wake = () => activity.wake(seconds(performance.now()));

    activity.setBusy(isCastPhase(rig.engine.getState()), seconds(performance.now()));
    const unsubscribe = rig.engine.subscribe((event) => {
      if (event.type !== "state") return;
      activity.setBusy(isCastPhase(event.state), seconds(performance.now()));
      wake();
    });
    const unwatch = rig.onWake(wake);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("resize", wake);

    let frame = 0;
    let lastDrawnAt: number | null = null;
    let fullRate = false;

    const tick = (timestamp: number) => {
      frame = requestAnimationFrame(tick);
      const now = seconds(timestamp);
      const active = activity.isActive(now);
      if (!shouldDrawFrame(now, lastDrawnAt, active, idleFrameRate)) return;

      // Only full-rate frames say anything about how fast the device is.
      if (active && fullRate && lastDrawnAt !== null) {
        if (monitor.frame(now - lastDrawnAt)) declineRef.current();
      } else {
        monitor.reset();
      }
      fullRate = active;

      origin.current ??= now;
      lastDrawnAt = now;
      advance(now - origin.current);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      unwatch();
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("resize", wake);
    };
  }, [advance, idleFrameRate, rig]);

  return null;
}
