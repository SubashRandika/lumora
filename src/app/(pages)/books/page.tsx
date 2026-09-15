import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/ui/PageIntro";
import { spellRegistry } from "@/data/registry";

export const metadata: Metadata = {
  title: "Books",
  description: "Browse spells by the book and film they appear in.",
  alternates: { canonical: "/books" },
};

export default function BooksPage() {
  const works = spellRegistry.works();

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <PageIntro eyebrow="Spell library" title="Books">
        <p>Spells grouped by the story they first appear in.</p>
      </PageIntro>

      <hr className="mt-12 rule-gilt" />
      <ol>
        {works.map((work) => {
          const count = spellRegistry.getByWork(work.id).length;
          return (
            <li key={work.id} className="border-b border-parchment/10">
              <Link
                href={`/books/${work.id}`}
                className="group grid grid-cols-[3rem_1fr] items-baseline gap-x-4 gap-y-1 py-6 sm:grid-cols-[4rem_1fr_auto]"
              >
                <span className="font-display text-3xl text-gold" aria-hidden="true">
                  {work.order}
                </span>
                <span className="font-display text-title text-parchment transition-colors group-hover:text-wandlight">
                  {work.title}
                  <span className="sr-only">, book {work.order}</span>
                </span>
                <span className="col-start-2 text-sm text-vellum sm:col-start-3">
                  {count} {count === 1 ? "spell" : "spells"} ·{" "}
                  {work.media.map((m) => (m === "book" ? "Book" : "Film")).join(" and ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
