import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { SPELL_CATEGORIES } from "@/config/categories";
import { site } from "@/config/site";
import { spellRegistry } from "@/data/registry";
import { formatDifficulty, summarizeAppearancesByWork } from "@/domain/spells/format";
import { WandMotionDiagram } from "@/components/spells/WandMotionDiagram";
import { serializeJsonLd, spellJsonLd } from "@/lib/seo/spellJsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return spellRegistry.all().map((spell) => ({ spellId: spell.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/spells/[spellId]">): Promise<Metadata> {
  const spell = spellRegistry.getById((await params).spellId);
  if (!spell) return {};
  const title = spell.incantation;
  return {
    title,
    description: `${spell.name}: ${spell.summary}`,
    alternates: { canonical: `/spells/${spell.id}` },
    openGraph: {
      title: `${title} | ${site.name}`,
      description: spell.summary,
      type: "article",
      url: `/spells/${spell.id}`,
    },
  };
}

export default async function SpellPage({ params }: PageProps<"/spells/[spellId]">) {
  const spell = spellRegistry.getById((await params).spellId);
  if (!spell) notFound();

  const { previous, next } = spellRegistry.getAdjacent(spell.id);
  const works = spell.appearances
    .map((appearance) => spellRegistry.getWork(appearance.workId))
    .filter((work, i, all): work is NonNullable<typeof work> =>
      Boolean(work && all.indexOf(work) === i),
    );
  const jsonLd = spellJsonLd(spell, works);

  return (
    <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="eyebrow">
        <Link href="/spells" className="hover:text-parchment">
          Spells
        </Link>
        <span aria-hidden="true" className="mx-2 text-gold">
          ✦
        </span>
        <span aria-current="page">{spell.name}</span>
      </nav>

      <header className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="gold">{SPELL_CATEGORIES[spell.category].label}</Badge>
          <Badge>{formatDifficulty(spell.difficulty)}</Badge>
        </div>
        <h1 className="mt-6 text-incantation text-parchment">{spell.incantation}</h1>
        {spell.pronunciation && (
          <p className="mt-4 text-vellum">
            <span className="sr-only">Pronunciation: </span>
            <span className="tracking-wide">/{spell.pronunciation}/</span>
          </p>
        )}
      </header>

      <hr className="my-10 rule-gilt" />

      <div className="grid gap-10 md:grid-cols-[1fr_16rem]">
        <div>
          <h2 className="font-display text-title text-parchment italic">{spell.name}</h2>
          <p className="mt-4 text-lg text-parchment/90">{spell.description}</p>
          {spell.notes && (
            <aside className="mt-8 border-l border-gold/40 pl-4 text-vellum">
              <h3 className="eyebrow">Note</h3>
              <p className="mt-1">{spell.notes}</p>
            </aside>
          )}
        </div>

        <dl className="space-y-6 text-sm">
          <div>
            <dt className="eyebrow">Appears in</dt>
            {summarizeAppearancesByWork(spell.appearances).map(([workId, summary]) => (
              <dd key={workId} className="mt-1">
                <Link
                  href={`/books/${workId}`}
                  className="text-parchment underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
                >
                  {spellRegistry.getWork(workId)?.shortTitle}
                </Link>
                <span className="block text-vellum">{summary}</span>
              </dd>
            ))}
          </div>
        </dl>
      </div>

      <section aria-labelledby="wand-motion" className="mt-14">
        <h2 id="wand-motion" className="mb-6 eyebrow">
          Wand motion
        </h2>
        <WandMotionDiagram spell={spell} />
      </section>

      <div className="mt-14">
        <ButtonLink href={`/spells/${spell.id}/cast`} size="lg">
          Cast {spell.incantation}
        </ButtonLink>
      </div>

      <nav
        aria-label="More spells"
        className="mt-20 grid gap-4 border-t border-parchment/10 pt-8 sm:grid-cols-2"
      >
        {previous && (
          <Link
            href={`/spells/${previous.id}`}
            className="group flex flex-col gap-1 py-2"
            rel="prev"
          >
            <span className="eyebrow">← Previous spell</span>
            <span className="font-display text-2xl text-parchment transition-colors group-hover:text-wandlight">
              {previous.incantation}
            </span>
          </Link>
        )}
        {next && (
          <Link
            href={`/spells/${next.id}`}
            className="group flex flex-col gap-1 py-2 sm:col-start-2 sm:items-end sm:text-right"
            rel="next"
          >
            <span className="eyebrow">Next spell →</span>
            <span className="font-display text-2xl text-parchment transition-colors group-hover:text-wandlight">
              {next.incantation}
            </span>
          </Link>
        )}
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </article>
  );
}
