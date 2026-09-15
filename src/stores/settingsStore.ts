import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GraphicsPreference } from "@/domain/performance/tier";

export type MotionPreference = "system" | "reduce" | "full";

export interface SettingsState {
  graphics: GraphicsPreference;
  motion: MotionPreference;
  soundEnabled: boolean;
  musicEnabled: boolean;
  /** 0–1 */
  masterVolume: number;
}

interface SettingsActions {
  setGraphics: (graphics: GraphicsPreference) => void;
  setMotion: (motion: MotionPreference) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const DEFAULT_SETTINGS: SettingsState = {
  graphics: "auto",
  motion: "system",
  soundEnabled: true,
  musicEnabled: false,
  masterVolume: 0.7,
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setGraphics: (graphics) => set({ graphics }),
      setMotion: (motion) => set({ motion }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setMusicEnabled: (musicEnabled) => set({ musicEnabled }),
      setMasterVolume: (volume) => set({ masterVolume: clamp01(volume) }),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "magic-words:settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Rehydrated on the client by <SettingsHydrator />, which avoids an SSR mismatch.
      skipHydration: true,
      partialize: ({ graphics, motion, soundEnabled, musicEnabled, masterVolume }) => ({
        graphics,
        motion,
        soundEnabled,
        musicEnabled,
        masterVolume,
      }),
    },
  ),
);
