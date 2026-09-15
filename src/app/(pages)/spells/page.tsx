import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SpellLibrary, SpellLibraryFallback } from "@/components/spells/SpellLibrary";
import { PageIntro } from "@/components/ui/PageIntro";
import { spellRegistry } from "@/data/registry";

export const metadata: Metadata = {
  title: "Spells",
  description:
    "Search and filter every spell cast by incantation in Harry Potter and the Philosopher’s Stone.",
  alternates: { canonical: "/spells" },
};

export default function SpellsPage() {
  const spells = spellRegistry.all();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <PageIntro eyebrow="Spell library" title="Spells">
        <p>
          Every spell cast with spoken words in the Philosopher’s Stone book or film.
          Choose one to learn it, then cast it in the chamber.
        </p>
        <p className="mt-3 text-base">
          <Link
            href="/books"
            className="text-parchment underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
          >
            Browse by book
          </Link>
        </p>
      </PageIntro>

      {/* The URL's filters are only known in the browser. The server sends the full list. */}
      <Suspense fallback={<SpellLibraryFallback spells={spells} />}>
        <SpellLibrary spells={spells} />
      </Suspense>
    </div>
  );
}
