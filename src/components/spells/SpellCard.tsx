import Link from "next/link";
import { SPELL_CATEGORIES } from "@/config/categories";
import { formatDifficulty } from "@/domain/spells/format";
import type { SpellDefinition } from "@/domain/spells/spell.schema";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { WandSigil } from "./WandSigil";

export function SpellCard({
  spell,
  headingLevel = "h2",
}: {
  spell: SpellDefinition;
  headingLevel?: "h2" | "h3";
}) {
  const headingId = `spell-${spell.id}`;
  const Heading = headingLevel;

  return (
    <Card
      as="article"
      interactive
      aria-labelledby={headingId}
      className="flex w-full flex-col p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge tone="gold">{SPELL_CATEGORIES[spell.category].label}</Badge>
        <WandSigil spell={spell} />
      </div>

      <Heading id={headingId} className="mt-5 font-display text-title text-parchment">
        {/* The full card surface is not a link, so the Cast action stays a distinct target. */}
        <Link
          href={`/spells/${spell.id}`}
          className="decoration-gold/60 underline-offset-4 hover:underline"
        >
          {spell.incantation}
        </Link>
      </Heading>
      <p className="mt-1 text-sm text-vellum">
        <span className="italic">{spell.name}</span>
        <span aria-hidden="true" className="mx-2 text-gold/60">
          ·
        </span>
        <span>{formatDifficulty(spell.difficulty)}</span>
      </p>
      <p className="mt-4 flex-1 text-parchment/85">{spell.summary}</p>

      <ButtonLink
        href={`/spells/${spell.id}/cast`}
        className="mt-8 self-start"
        aria-label={`Cast ${spell.incantation}`}
      >
        Cast spell
      </ButtonLink>
    </Card>
  );
}
