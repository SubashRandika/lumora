import {
  describeWandMotion,
  fitGesture,
  pathEnds,
  resolveWandPath,
  toSvgPath,
} from "@/domain/casting/wandPath";
import type { SpellDefinition } from "@/domain/spells/spell.schema";

const SIZE = 240;
const PADDING = 36;

/**
 * The gesture drawn as a path from a start dot to an arrowhead, with a plain
 * sentence beside it. The sentence is the accessible description; the drawing
 * is a visual aid. The path draws itself once, and stays still under reduced motion.
 */
export function WandMotionDiagram({ spell }: { spell: SpellDefinition }) {
  const points = fitGesture(resolveWandPath(spell.wandMotion));
  const ends = pathEnds(points, SIZE, PADDING);
  const { core, glow } = spell.visualEffect.palette;
  const description = describeWandMotion(spell.wandMotion);
  const center = SIZE / 2;

  return (
    <figure className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
      <svg
        role="img"
        aria-label={`Wand motion: ${description}`}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-48 max-w-full shrink-0 rounded-card border border-parchment/10 bg-night sm:w-60"
      >
        {/* Faint guides, like a practice sheet. */}
        <g stroke="var(--color-parchment)" strokeOpacity={0.07} strokeWidth={1}>
          <line x1={center} y1={16} x2={center} y2={SIZE - 16} />
          <line x1={16} y1={center} x2={SIZE - 16} y2={center} />
          <circle cx={center} cy={center} r={center - PADDING} fill="none" />
        </g>

        <path
          d={toSvgPath(points, SIZE, PADDING)}
          pathLength={1}
          fill="none"
          stroke={glow}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw [stroke-dasharray:1] [stroke-dashoffset:1]"
          style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
        />

        {ends && (
          <>
            <circle
              cx={ends.start.x}
              cy={ends.start.y}
              r={5}
              fill="none"
              stroke={core}
              strokeWidth={2}
            />
            <polygon
              points="0,-7 12,0 0,7"
              fill={core}
              transform={`translate(${ends.end.x} ${ends.end.y}) rotate(${ends.endAngle})`}
              className="animate-emerge [animation-delay:1.1s]"
            />
          </>
        )}
      </svg>

      <figcaption className="max-w-xs">
        <p className="text-lg text-parchment">{description}</p>
        <p className="mt-2 text-sm text-vellum">
          Start at the ring, finish at the arrow.
        </p>
      </figcaption>
    </figure>
  );
}
