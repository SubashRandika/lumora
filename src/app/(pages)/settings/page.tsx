import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { PageIntro } from "@/components/ui/PageIntro";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <PageIntro eyebrow="Preferences" title="Settings">
        <p>Saved in this browser.</p>
      </PageIntro>
      <SettingsPanel />
    </div>
  );
}
