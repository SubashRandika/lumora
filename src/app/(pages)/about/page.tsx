import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/PageIntro";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "About",
  description: "What Lumora is, and how it treats the source material.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <PageIntro eyebrow="About" title="A fan-made spellbook">
        <p>
          Lumora lets you pick a spell from the first Harry Potter story and cast it in a
          candlelit 3D chamber.
        </p>
      </PageIntro>

      <div className="mt-12 space-y-10 text-parchment/90">
        <section aria-labelledby="source">
          <h2 id="source" className="text-title text-parchment">
            The spells
          </h2>
          <p className="mt-3">
            The library covers spells cast with spoken words in the book, the 2001 film,
            or both. Each entry says where the spell appears. Where the book and film
            differ, a note explains how. Descriptions are written fresh, never quoted.
          </p>
        </section>

        <section aria-labelledby="original">
          <h2 id="original" className="text-title text-parchment">
            Everything here is original
          </h2>
          <p className="mt-3">
            The chamber, wands, props, particle effects, and sounds are made for this
            project. Nothing is taken from the films, and no one here is meant to look
            like a real actor or character.
          </p>
        </section>

        <aside className="border-l border-gold/40 pl-4 text-vellum">
          {site.disclaimer}
        </aside>
      </div>
    </div>
  );
}
