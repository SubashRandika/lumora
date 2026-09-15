import { describe, expect, it } from "vitest";
import {
  createActivityTracker,
  createFrameRateMonitor,
  shouldDrawFrame,
} from "./framePacing";

/** Feeds `seconds` of frames at `fps`; returns how many times the monitor reported. */
function run(
  monitor: ReturnType<typeof createFrameRateMonitor>,
  fps: number,
  seconds: number,
) {
  let reports = 0;
  for (let i = 0; i < Math.round(fps * seconds); i++) {
    if (monitor.frame(1 / fps)) reports += 1;
  }
  return reports;
}

describe("createFrameRateMonitor", () => {
  const options = { minFps: 45, windowSeconds: 3 };

  it("stays quiet at a healthy frame rate, however long it runs", () => {
    const monitor = createFrameRateMonitor(options);
    expect(run(monitor, 60, 120)).toBe(0);
  });

  it("reports once the frame rate stays low for the whole window", () => {
    const monitor = createFrameRateMonitor(options);
    expect(run(monitor, 30, 2.4)).toBe(0);
    expect(run(monitor, 30, 0.7)).toBe(1);
  });

  it("still reports a slowdown that starts after a long healthy stretch", () => {
    // drei's PerformanceMonitor stops sampling after a few inclines at 60 fps.
    const monitor = createFrameRateMonitor(options);
    run(monitor, 60, 60);
    expect(run(monitor, 25, 4)).toBe(1);
  });

  it("starts a fresh window after reporting", () => {
    const monitor = createFrameRateMonitor(options);
    expect(run(monitor, 30, 3.1)).toBe(1);
    expect(run(monitor, 30, 2)).toBe(0);
    expect(run(monitor, 30, 1.2)).toBe(1);
  });

  it("ignores brief dips", () => {
    const monitor = createFrameRateMonitor(options);
    run(monitor, 60, 2);
    run(monitor, 20, 0.5);
    expect(run(monitor, 60, 3)).toBe(0);
  });

  it("treats long gaps as pauses, not slowness", () => {
    const monitor = createFrameRateMonitor(options);
    for (let i = 0; i < 10; i++) expect(monitor.frame(5)).toBe(false);
    expect(run(monitor, 60, 3)).toBe(0);
  });

  it("forgets samples on reset", () => {
    const monitor = createFrameRateMonitor(options);
    run(monitor, 30, 2.8);
    monitor.reset();
    expect(run(monitor, 30, 2.8)).toBe(0);
  });
});

describe("shouldDrawFrame", () => {
  it("draws every frame while active", () => {
    expect(shouldDrawFrame(10.016, 10, true, 30)).toBe(true);
  });

  it("paces to the idle rate at rest, tolerating timestamp jitter", () => {
    expect(shouldDrawFrame(10.0167, 10, false, 30)).toBe(false);
    expect(shouldDrawFrame(10.0332, 10, false, 30)).toBe(true);
  });

  it("always draws the first frame, and never throttles with no idle rate", () => {
    expect(shouldDrawFrame(10, null, false, 30)).toBe(true);
    expect(shouldDrawFrame(10.001, 10, false, 0)).toBe(true);
  });
});

describe("createActivityTracker", () => {
  it("is active at first, then settles", () => {
    const activity = createActivityTracker(2, 0);
    expect(activity.isActive(1.9)).toBe(true);
    expect(activity.isActive(2.1)).toBe(false);
  });

  it("wakes for the settle time after input", () => {
    const activity = createActivityTracker(2, 0);
    activity.wake(5);
    expect(activity.isActive(6.5)).toBe(true);
    expect(activity.isActive(7.5)).toBe(false);
  });

  it("stays active through a cast and settles after it ends", () => {
    const activity = createActivityTracker(2, 0);
    activity.setBusy(true, 3);
    expect(activity.isActive(30)).toBe(true);
    activity.setBusy(false, 30);
    expect(activity.isActive(31)).toBe(true);
    expect(activity.isActive(32.5)).toBe(false);
  });
});
