"use client";

import { useSyncExternalStore } from "react";
import { useSettingsStore, type MotionPreference } from "@/stores/settingsStore";

const QUERY = "(prefers-reduced-motion: reduce)";

export function resolveReducedMotion(
  preference: MotionPreference,
  systemPrefersReduced: boolean,
): boolean {
  if (preference === "reduce") return true;
  if (preference === "full") return false;
  return systemPrefersReduced;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True when motion should be reduced, combining the Settings choice with the OS preference. */
export function useReducedMotion(): boolean {
  const preference = useSettingsStore((s) => s.motion);
  const systemPrefersReduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return resolveReducedMotion(preference, systemPrefersReduced);
}
