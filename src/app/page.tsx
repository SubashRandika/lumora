import { EnterChamberLink } from "@/components/landing/EnterChamberLink";
import { SpellIndex } from "@/components/landing/SpellIndex";
import { WandlightHero } from "@/components/landing/WandlightHero";
import { SiteFooter } from "@/components/navigation/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { spellRegistry } from "@/data/registry";

export default function HomePage() {
  const [work] = spellRegistry.works();
  const spells = work ? spellRegistry.getByWork(work.id) : spellRegistry.all();

  return (
    <>
      <SiteHeader overlay />
      <main id="main" className="flex-1">
        <WandlightHero
          labelledBy="hero-title"
          incantations={spells.map((spell) => spell.incantation)}
        >
          <div className="relative z-10 mx-auto flex min-h-svh max-w-6xl flex-col justify-end px-5 pt-32 pb-14 sm:px-8 sm:pb-20">
            {work && (
              <p className="eyebrow">
                {work.shortTitle} · {spells.length} spells
              </p>
            )}
            <h1 id="hero-title" className="mt-4 text-incantation text-parchment">
              Cast the <em className="text-gold-bright">Magic.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-parchment/80">
              Explore magical spells from Harry Potter and the Philosopher’s Stone. Choose
              one, speak the words, and watch it take hold.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <EnterChamberLink href="/chamber">Enter the Chamber</EnterChamberLink>
              <ButtonLink href="/spells" variant="quiet" size="lg">
                Browse spells
              </ButtonLink>
            </div>
            <p className="mt-12 hidden text-sm text-vellum pointer-fine:block">
              Move the light across the wall to read what’s carved there.
            </p>
          </div>
        </WandlightHero>

        <SpellIndex spells={spells} title="The first year’s spells" />
      </main>
      <SiteFooter />
    </>
  );
}
