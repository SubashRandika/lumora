import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SPELL_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { spellRegistry } from "@/data/registry";
import {
  fitGesture,
  pathEnds,
  resolveWandPath,
  toSvgPath,
} from "@/domain/casting/wandPath";

export const alt = "Spell card from the Lumora spell library";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return spellRegistry.all().map((spell) => ({ spellId: spell.id }));
}

// IM Fell English, OFL-licensed, shipped as a dev dependency by @fontsource.
const fontPath = join(
  process.cwd(),
  "node_modules/@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff",
);

const SIGIL = 360;

export default async function Image({
  params,
}: {
  params: Promise<{ spellId: string }>;
}) {
  const spell = spellRegistry.getById((await params).spellId);
  const fell = await readFile(fontPath);

  if (!spell) {
    return new ImageResponse(<div style={{ background: "#0b0d12", flex: 1 }} />, size);
  }

  const points = fitGesture(resolveWandPath(spell.wandMotion));
  const ends = pathEnds(points, SIGIL, 70);
  const { core, glow } = spell.visualEffect.palette;
  const incantationSize = spell.incantation.length > 16 ? 104 : 128;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 88px",
        background:
          "radial-gradient(circle at 78% 45%, rgba(247,233,184,0.10) 0%, rgba(11,13,18,0) 45%), #0b0d12",
        color: "#e9ddc3",
        fontFamily: "Fell",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 680 }}>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#c29d5b",
          }}
        >
          {`${site.name} · ${SPELL_CATEGORIES[spell.category].label}`}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: incantationSize,
            lineHeight: 0.95,
            color: "#e9ddc3",
          }}
        >
          {spell.incantation}
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 40, color: "#a89d87" }}>
          {spell.name}
        </div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 22, color: "#a89d87" }}>
          Unofficial fan project
        </div>
      </div>

      <svg width={SIGIL} height={SIGIL} viewBox={`0 0 ${SIGIL} ${SIGIL}`}>
        <circle
          cx={SIGIL / 2}
          cy={SIGIL / 2}
          r={SIGIL / 2 - 4}
          fill="none"
          stroke="#c29d5b"
          strokeOpacity={0.45}
          strokeWidth={2}
        />
        <circle
          cx={SIGIL / 2}
          cy={SIGIL / 2}
          r={SIGIL / 2 - 22}
          fill="none"
          stroke="#c29d5b"
          strokeOpacity={0.15}
          strokeWidth={2}
        />
        <path
          d={toSvgPath(points, SIGIL, 70)}
          fill="none"
          stroke={glow}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {ends && <circle cx={ends.end.x} cy={ends.end.y} r={12} fill={core} />}
      </svg>
    </div>,
    { ...size, fonts: [{ name: "Fell", data: fell, style: "normal", weight: 400 }] },
  );
}
