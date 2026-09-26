"use client";

// Shared viewport-width subscription for the SetRow grid engine.
// A single resize listener is shared by every subscriber (one per card set),
// and `useSyncExternalStore` keeps SSR/hydration safe: the server snapshot is
// 0 (treated as the most constrained / narrow layout) and the real width
// arrives right after mount, so the first client paint always matches SSR.

import { useSyncExternalStore } from "react";

let listeners: Array<(w: number) => void> = [];

function emit() {
  const w = window.innerWidth;
  for (const l of listeners) l(w);
}

function subscribe(cb: (w: number) => void): () => void {
  listeners.push(cb);
  if (listeners.length === 1) {
    window.addEventListener("resize", emit);
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0) {
      window.removeEventListener("resize", emit);
    }
  };
}

/** Current viewport width in px (0 before mount / on the server). */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 0,
  );
}
