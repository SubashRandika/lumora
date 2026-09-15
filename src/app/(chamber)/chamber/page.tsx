import type { Metadata } from "next";
import { ChamberExperience } from "@/components/chamber/ChamberExperience";
import { ChamberNoScript } from "@/components/chamber/ChamberNoScript";
import { spellRegistry } from "@/data/registry";

export const metadata: Metadata = {
  title: "The Chamber",
  description: "Step into the candlelit spell chamber.",
  robots: { index: false },
};

export default function ChamberPage() {
  const spells = spellRegistry.all();
  const first = spells[0]!;

  return (
    <>
      <ChamberExperience spells={spells} initialSpellId={first.id} />
      <ChamberNoScript spell={first} />
    </>
  );
}
