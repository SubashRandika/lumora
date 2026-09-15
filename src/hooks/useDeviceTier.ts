"use client";

import { useSyncExternalStore } from "react";
import { detectTier, type TierDecision } from "@/domain/performance/tier";
import { probeDevice } from "@/lib/device/probeDevice";

let cached: TierDecision | undefined;

/** Probes once per page load; the answer can't change while the page is open. */
function getSnapshot(): TierDecision {
  cached ??= detectTier(probeDevice());
  return cached;
}

const subscribe = () => () => {};

/**
 * The device's WebGL support and detected tier, or null during server
 * rendering and hydration (when the device can't be known yet).
 */
export function useDeviceTier(): TierDecision | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
