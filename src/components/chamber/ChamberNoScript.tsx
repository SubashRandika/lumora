import type { SpellDefinition } from "@/domain/spells/spell.schema";

/** Without JavaScript the chamber can't run; this covers its loading screen with a way forward. */
export function ChamberNoScript({ spell }: { spell: SpellDefinition }) {
  return (
    <noscript>
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-ink px-5 text-center">
        <p className="font-display text-title text-parchment">
          The chamber needs JavaScript
        </p>
        <p className="mt-4 max-w-md text-vellum">
          Turn on JavaScript to enter the 3D chamber, or read about {spell.incantation}{" "}
          instead.
        </p>
        <a
          href={`/spells/${spell.id}`}
          className="mt-8 text-parchment underline decoration-gold/50 underline-offset-4"
        >
          Read about {spell.incantation}
        </a>
      </div>
    </noscript>
  );
}
