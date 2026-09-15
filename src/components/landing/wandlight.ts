/*
 * Pure helpers for the landing-page wand-light. Kept free of DOM access so
 * the motion can be unit-tested and tuned without a browser.
 */

export interface Point {
  x: number;
  y: number;
}

/** Where the light rests before JavaScript runs, and under reduced motion. Fractions of the hero. */
export const REST_POSITION: Point = { x: 0.68, y: 0.38 };

/**
 * A slow figure-of-eight across the upper wall, used when nobody is steering
 * the light. `t` is seconds. One loop takes about 40 seconds, slow enough to
 * read as candle drift rather than an animation.
 */
export function driftPosition(t: number): Point {
  const w = (Math.PI * 2) / 40;
  return {
    x: 0.58 + 0.26 * Math.sin(w * t),
    y: 0.4 + 0.14 * Math.sin(2 * w * t + Math.PI / 3),
  };
}

/**
 * Frame-rate-independent easing toward a target. `smoothing` is the fraction
 * of distance left after one second (lower = snappier).
 */
export function easeToward(
  current: Point,
  target: Point,
  deltaSeconds: number,
  smoothing = 0.0005,
): Point {
  const keep = Math.pow(smoothing, Math.min(deltaSeconds, 0.1));
  return {
    x: target.x + (current.x - target.x) * keep,
    y: target.y + (current.y - target.y) * keep,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Builds the rows of carved text for the wall. Each row starts at a different
 * spell and repeats so it always overflows the viewport, whatever the width.
 */
export function buildWallRows(
  incantations: readonly string[],
  rowCount: number,
): string[][] {
  if (incantations.length === 0) return [];
  return Array.from({ length: rowCount }, (_, row) => {
    const offset = (row * 3) % incantations.length;
    const rotated = [...incantations.slice(offset), ...incantations.slice(0, offset)];
    return [...rotated, ...rotated];
  });
}
