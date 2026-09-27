"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — Haptics layer (§4.17). Web: navigator.vibrate patterns; no-op when
// unsupported or hapticsEnabled=false. The store keeps the enabled flag in sync
// (setHapticsEnabled), so components call tap()/success()/… unconditionally.
// ─────────────────────────────────────────────────────────────────────────────

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function vibrate(pattern: number | number[]): void {
  if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* no-op */
  }
}

/** Light selection feedback (chip select, tab switch). */
export function hapticTap(): void {
  vibrate(10);
}

/** Success (set completed, workout finished, PR achieved). */
export function hapticSuccess(): void {
  vibrate([10, 30, 10]);
}

/** Warning (destructive confirm open). */
export function hapticWarning(): void {
  vibrate([30]);
}

/** Error (error toast). */
export function hapticError(): void {
  vibrate([50, 50, 50]);
}

/** Micro selection (scrolling pickers, segmented controls). */
export function hapticSelection(): void {
  vibrate(5);
}
