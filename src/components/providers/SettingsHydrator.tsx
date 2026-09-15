"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Loads persisted settings after the first client render. The server
 * renders defaults, so doing this in an effect avoids a hydration mismatch.
 */
export function SettingsHydrator() {
  useEffect(() => {
    void useSettingsStore.persist.rehydrate();
  }, []);
  return null;
}
