import {
  fitGesture,
  pathEnds,
  resolveWandPath,
  toSvgPath,
} from "@/domain/casting/wandPath";
import type { SpellDefinition } from "@/domain/spells/spell.schema";

const SIZE = 48;
const PADDING = 11;

/**
 * A small seal drawn from the spell's own wand motion and colours, so no
 * two spells share a mark. Decorative: the card's text carries the meaning.
 */
export function WandSigil({
  spell,
  size = SIZE,
}: {
  spell: SpellDefinition;
  size?: number;
}) {
  const points = fitGesture(resolveWandPath(spell.wandMotion));
  const ends = pathEnds(points, SIZE, PADDING);
  const { core, glow } = spell.visualEffect.palette;
  const center = SIZE / 2;

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0 overflow-visible"
    >
      <circle
        cx={center}
        cy={center}
        r={center - 1.5}
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <circle
        cx={center}
        cy={center}
        r={center - 4.5}
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity={0.12}
        strokeWidth={1}
        strokeDasharray="1 3"
      />
      <path
        d={toSvgPath(points, SIZE, PADDING)}
        fill="none"
        stroke={glow}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
      />
      {ends && <circle cx={ends.end.x} cy={ends.end.y} r={2.25} fill={core} />}
    </svg>
  );
}
