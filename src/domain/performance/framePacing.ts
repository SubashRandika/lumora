/*
 * Frame pacing for the chamber. Pure: the 3D layer feeds in timestamps and
 * activity, and these functions decide whether to draw a frame and whether
 * the frame rate has stayed too low for too long.
 */

/** A gap this long isn't slowness; the tab was hidden or the page paused. */
const PAUSE_SECONDS = 1;
/** rAF timestamps jitter; allow this much early so 30 fps doesn't fall to 20 on a 60 Hz display. */
const PACING_SLACK_SECONDS = 0.004;

export interface FrameRateMonitorOptions {
  /** Frame rate below which a sample counts as slow. */
  minFps: number;
  /** How long the frame rate must stay low before the monitor reports it. */
  windowSeconds: number;
  /** Length of one sample. */
  sampleSeconds?: number;
  /** Share of the window's samples that must be slow. */
  slowShare?: number;
}

export interface FrameRateMonitor {
  /**
   * Records one rendered frame, `delta` seconds after the previous one.
   * Returns true when the frame rate has stayed low for the whole window;
   * the window then starts over, so a slow device is reported once per window.
   */
  frame(delta: number): boolean;
  /** Forgets every sample, e.g. when frames stop being drawn at full rate. */
  reset(): void;
}

/**
 * Unlike drei's `PerformanceMonitor`, this never gives up: a device that
 * starts fast and slows down later (a heavy spell, a hot laptop) is still caught.
 */
export function createFrameRateMonitor({
  minFps,
  windowSeconds,
  sampleSeconds = 0.5,
  slowShare = 0.75,
}: FrameRateMonitorOptions): FrameRateMonitor {
  const size = Math.max(1, Math.round(windowSeconds / sampleSeconds));
  let samples: number[] = [];
  let frames = 0;
  let elapsed = 0;

  const reset = () => {
    samples = [];
    frames = 0;
    elapsed = 0;
  };

  return {
    frame(delta) {
      if (!(delta > 0) || delta >= PAUSE_SECONDS) {
        // A pause splits the sample: neither side of it says anything about speed.
        frames = 0;
        elapsed = 0;
        return false;
      }
      frames += 1;
      elapsed += delta;
      // Summed frame times fall a hair short of exact multiples.
      if (elapsed < sampleSeconds - 1e-6) return false;

      samples.push(frames / elapsed);
      if (samples.length > size) samples.shift();
      frames = 0;
      elapsed = 0;
      if (samples.length < size) return false;

      const slow = samples.filter((fps) => fps < minFps).length;
      if (slow <= size * slowShare) return false;
      samples = [];
      return true;
    },
    reset,
  };
}

/**
 * Whether to draw on this animation frame. While something moves (a cast, the
 * pointer, a settling camera) every frame is drawn; at rest only the candles
 * and dust move, slowly enough that a lower rate looks the same and saves power.
 */
export function shouldDrawFrame(
  now: number,
  lastDrawnAt: number | null,
  active: boolean,
  idleFrameRate: number,
): boolean {
  if (active || lastDrawnAt === null || idleFrameRate <= 0) return true;
  return now - lastDrawnAt >= 1 / idleFrameRate - PACING_SLACK_SECONDS;
}

export interface ActivityTracker {
  /** Something just moved or changed; stay at full rate for a while. */
  wake(now: number): void;
  /** A cast is running (or not); full rate for as long as it is. */
  setBusy(busy: boolean, now: number): void;
  isActive(now: number): boolean;
}

/** Full rate while busy, and for `settleSeconds` after the last wake, so easing camera and wand moves finish smoothly. */
export function createActivityTracker(
  settleSeconds: number,
  now: number,
): ActivityTracker {
  let busy = false;
  let lastWake = now;
  return {
    wake(at) {
      lastWake = Math.max(lastWake, at);
    },
    setBusy(value, at) {
      if (busy && !value) lastWake = Math.max(lastWake, at);
      busy = value;
    },
    isActive: (at) => busy || at - lastWake < settleSeconds,
  };
}
