import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChamberExperience } from "@/components/chamber/ChamberExperience";
import { ChamberNoScript } from "@/components/chamber/ChamberNoScript";
import { spellRegistry } from "@/data/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return spellRegistry.all().map((spell) => ({ spellId: spell.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/spells/[spellId]/cast">): Promise<Metadata> {
  const spell = spellRegistry.getById((await params).spellId);
  return spell
    ? {
        title: `Cast ${spell.incantation}`,
        robots: { index: false },
        alternates: { canonical: `/spells/${spell.id}` },
      }
    : {};
}

export default async function CastSpellPage({
  params,
}: PageProps<"/spells/[spellId]/cast">) {
  const spell = spellRegistry.getById((await params).spellId);
  if (!spell) notFound();

  return (
    <>
      <ChamberExperience spells={spellRegistry.all()} initialSpellId={spell.id} />
      <ChamberNoScript spell={spell} />
    </>
  );
}
