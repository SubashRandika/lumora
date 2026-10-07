"use client";

import type { ReactNode } from "react";
import { ChoiceGroup, type Choice } from "@/components/ui/ChoiceGroup";
import { Slider } from "@/components/ui/Slider";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import type { GraphicsPreference } from "@/domain/performance/tier";
import { useSettingsStore, type MotionPreference } from "@/stores/settingsStore";

const GRAPHICS_CHOICES: readonly Choice<GraphicsPreference>[] = [
  { value: "auto", label: "Auto", hint: "Matches quality to your device" },
  { value: "low", label: "Low", hint: "Fewest effects, smoothest on older devices" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", hint: "Full lighting, bloom, and particles" },
];

const MOTION_CHOICES: readonly Choice<MotionPreference>[] = [
  { value: "system", label: "Use device setting" },
  { value: "reduce", label: "Reduce motion" },
  { value: "full", label: "Full motion" },
];

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-parchment/10 py-6">
      <h2 className="mb-2 eyebrow">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPanel() {
  const settings = useSettingsStore();

  return (
    <div className="mt-10">
      <SettingsSection title="Graphics">
        <ChoiceGroup
          legend="Quality"
          description="Lower quality keeps the chamber smooth on less powerful devices."
          choices={GRAPHICS_CHOICES}
          value={settings.graphics}
          onValueChange={settings.setGraphics}
        />
      </SettingsSection>

      <SettingsSection title="Accessibility">
        <ChoiceGroup
          legend="Motion"
          description="Reduced motion keeps the camera still and softens spell effects."
          choices={MOTION_CHOICES}
          value={settings.motion}
          onValueChange={settings.setMotion}
        />
      </SettingsSection>

      <SettingsSection title="Sound">
        <Toggle
          label="Sound effects"
          checked={settings.soundEnabled}
          onCheckedChange={settings.setSoundEnabled}
        />
        <Toggle
          label="Music"
          checked={settings.musicEnabled}
          onCheckedChange={settings.setMusicEnabled}
        />
        <Slider
          label="Master volume"
          value={settings.masterVolume}
          onValueChange={settings.setMasterVolume}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          disabled={!settings.soundEnabled && !settings.musicEnabled}
        />
      </SettingsSection>

      <SettingsSection title="Voice">
        <Toggle
          label="Cast by voice"
          description="Shows a microphone in the chamber. Press it, say an incantation, and the spell is cast. Your browser transcribes what you say; the microphone only opens while you hold a session. Needs Chrome, Edge, or Safari."
          checked={settings.voiceEnabled}
          onCheckedChange={settings.setVoiceEnabled}
        />
      </SettingsSection>

      <div className="border-t border-parchment/10 pt-6">
        <Button variant="quiet" onClick={settings.resetSettings}>
          Restore defaults
        </Button>
      </div>
    </div>
  );
}
