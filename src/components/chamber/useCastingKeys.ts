"use client";

import { useEffect, useRef } from "react";

interface CastingKeyHandlers {
  enabled: boolean;
  /** Space. */
  onCast: () => void;
  /** Escape. */
  onCancel: () => void;
  /** R. */
  onReset: () => void;
  /** V. Absent where the browser can't listen. */
  onVoice?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Whether a key press should belong to the focused control instead of the chamber. */
export function shouldIgnoreKey(
  event: Pick<
    KeyboardEvent,
    "key" | "repeat" | "altKey" | "ctrlKey" | "metaKey" | "target"
  >,
): boolean {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return true;
  if (isTypingTarget(event.target)) return true;
  // Space on a focused button or link activates that control; don't also cast.
  if (event.key === " " && event.target instanceof HTMLElement) {
    return Boolean(event.target.closest("button, a, [role='button']"));
  }
  return false;
}

/**
 * Space casts, Escape cancels, R resets, V listens. Active only while the
 * chamber is usable.
 */
export function useCastingKeys({
  enabled,
  onCast,
  onCancel,
  onReset,
  onVoice,
}: CastingKeyHandlers) {
  const handlers = useRef({ onCast, onCancel, onReset, onVoice });
  useEffect(() => {
    handlers.current = { onCast, onCancel, onReset, onVoice };
  }, [onCast, onCancel, onReset, onVoice]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKey(event)) return;
      if (event.key === " ") {
        event.preventDefault();
        handlers.current.onCast();
      } else if (event.key === "Escape") {
        handlers.current.onCancel();
      } else if (event.key === "r" || event.key === "R") {
        handlers.current.onReset();
      } else if (event.key === "v" || event.key === "V") {
        handlers.current.onVoice?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
