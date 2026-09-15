import { PageShell } from "@/components/navigation/PageShell";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageShell>
      <section className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-4 text-display text-parchment">Nothing here</h1>
        <p className="mt-4 text-vellum">
          This page doesn’t exist. If you followed a link to a spell, it may have been
          renamed.
        </p>
        <ButtonLink href="/spells" className="mt-10">
          Browse spells
        </ButtonLink>
      </section>
    </PageShell>
  );
}
