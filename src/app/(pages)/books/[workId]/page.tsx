import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpellCard } from "@/components/spells/SpellCard";
import { PageIntro } from "@/components/ui/PageIntro";
import { spellRegistry } from "@/data/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return spellRegistry.works().map((work) => ({ workId: work.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/books/[workId]">): Promise<Metadata> {
  const work = spellRegistry.getWork((await params).workId);
  return work
    ? {
        title: work.shortTitle,
        description: `Spells cast in ${work.title}.`,
        alternates: { canonical: `/books/${work.id}` },
      }
    : {};
}

export default async function WorkPage({ params }: PageProps<"/books/[workId]">) {
  const { workId } = await params;
  const work = spellRegistry.getWork(workId);
  if (!work) notFound();
  const spells = spellRegistry.getByWork(work.id);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-10 eyebrow">
        <Link href="/books" className="hover:text-parchment">
          Books
        </Link>
        <span aria-hidden="true" className="mx-2 text-gold">
          ✦
        </span>
        <span aria-current="page">{work.shortTitle}</span>
      </nav>
      <PageIntro eyebrow={`Book ${work.order}`} title={work.shortTitle}>
        <p>
          {spells.length} spells cast in {work.title}, across the book and the film.
        </p>
      </PageIntro>
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {spells.map((spell) => (
          <li key={spell.id} className="flex">
            <SpellCard spell={spell} />
          </li>
        ))}
      </ul>
    </div>
  );
}
