import type {
  WandMotionDefinition,
  WandMotionPreset,
} from "@/domain/spells/spell.schema";

/*
 * Wand gestures as paths in a normalised square: x and y in [-1, 1], +y up,
 * z toward the target. The same points drive the diagram on spell pages now
 * and the 3D wand animation in Phase 5, so what users learn is what they cast.
 */

export interface GesturePoint {
  x: number;
  y: number;
  z?: number;
}

const arc = (
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  steps: number,
): GesturePoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

/** Original interpretations, except swish-and-flick which follows the source description. */
const PRESET_PATHS: Record<WandMotionPreset, GesturePoint[]> = {
  flick: [
    { x: -0.45, y: -0.35 },
    { x: -0.05, y: -0.2 },
    { x: 0.5, y: 0.55 },
  ],
  swish: arc(0, 0.35, 0.8, Math.PI * 1.05, Math.PI * 1.95, 8),
  // A smooth swoop down and across, then a sharp upward flick.
  "swish-and-flick": [
    ...arc(-0.05, 0.25, 0.65, Math.PI * 1.02, Math.PI * 1.75, 7),
    { x: 0.62, y: 0.15 },
    { x: 0.78, y: 0.72 },
  ],
  circle: arc(0, 0, 0.6, Math.PI / 2, Math.PI / 2 + Math.PI * 2, 16),
  upward: [
    { x: -0.1, y: -0.7 },
    { x: 0.05, y: 0 },
    { x: 0.1, y: 0.7 },
  ],
  downward: [
    { x: 0.1, y: 0.7 },
    { x: -0.05, y: 0 },
    { x: -0.1, y: -0.7 },
  ],
  jab: [
    { x: -0.35, y: -0.35, z: 0 },
    { x: 0.35, y: 0.35, z: 1 },
  ],
  twist: [...arc(0, 0, 0.45, Math.PI, Math.PI * 2.75, 10), { x: 0.1, y: 0.7 }],
};

const DESCRIPTIONS: Record<WandMotionPreset, string> = {
  flick: "A short, sharp flick up and to the right.",
  swish: "One smooth swish in a low arc from left to right.",
  "swish-and-flick": "Swish in a smooth arc, then finish with a quick flick upward.",
  circle: "Draw one full circle, starting and ending at the top.",
  upward: "Sweep the wand straight upward.",
  downward: "Bring the wand sharply downward.",
  jab: "Jab straight toward the target.",
  twist: "Twist the wand in a tight turn, then lift.",
};

export function resolveWandPath(motion: WandMotionDefinition): GesturePoint[] {
  return motion.type === "custom" ? motion.points : PRESET_PATHS[motion.type];
}

export function describeWandMotion(motion: WandMotionDefinition): string {
  return motion.type === "custom"
    ? (motion.description ?? "Follow the path from the ring to the arrow.")
    : DESCRIPTIONS[motion.type];
}

/**
 * For drawings only: scales and centres a gesture so its longest side spans
 * `extent` (in the -1..1 square), keeping proportions. Small gestures like a
 * jab stay legible at icon size. Never use this for the 3D wand, where the
 * real size of the motion matters.
 */
export function fitGesture(
  points: readonly GesturePoint[],
  extent = 1.6,
): GesturePoint[] {
  if (points.length < 2) return [...points];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  if (span === 0) return points.map((p) => ({ ...p, x: 0, y: 0 }));
  const scale = extent / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({ ...p, x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Maps gesture space to SVG space (y flipped) inside a `size` square with
 * `padding`, and returns a smooth path through every point (Catmull-Rom
 * converted to cubic Béziers).
 */
export function toSvgPath(
  points: readonly GesturePoint[],
  size: number,
  padding = 0,
): string {
  if (points.length === 0) return "";
  const scale = (size - padding * 2) / 2;
  const svg = points.map((p) => ({
    x: round(padding + (p.x + 1) * scale),
    y: round(padding + (1 - p.y) * scale),
  }));

  const [first] = svg;
  if (!first) return "";
  if (svg.length === 1) return `M${first.x} ${first.y}`;

  let d = `M${first.x} ${first.y}`;
  for (let i = 0; i < svg.length - 1; i++) {
    const p0 = svg[i - 1] ?? svg[i]!;
    const p1 = svg[i]!;
    const p2 = svg[i + 1]!;
    const p3 = svg[i + 2] ?? p2;
    const c1 = { x: round(p1.x + (p2.x - p0.x) / 6), y: round(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: round(p2.x - (p3.x - p1.x) / 6), y: round(p2.y - (p3.y - p1.y) / 6) };
    d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Start and end in SVG space, plus the end direction in degrees (for an arrowhead). */
export function pathEnds(points: readonly GesturePoint[], size: number, padding = 0) {
  const scale = (size - padding * 2) / 2;
  const toSvg = (p: GesturePoint) => ({
    x: round(padding + (p.x + 1) * scale),
    y: round(padding + (1 - p.y) * scale),
  });
  const first = points[0];
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2] ?? first;
  if (!first || !last || !beforeLast) return null;
  const end = toSvg(last);
  const prev = toSvg(beforeLast);
  return {
    start: toSvg(first),
    end,
    endAngle: round((Math.atan2(end.y - prev.y, end.x - prev.x) * 180) / Math.PI),
  };
}
