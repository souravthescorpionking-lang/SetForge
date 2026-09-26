"use client";

// useHashSegment — first path segment of the current hash route
// (e.g. "routines" for #/routines/abc?x=1). Lets NavBar/NavPane highlight the
// active destination without depending on any feature-level routing state.
// Hydration-safe via useSyncExternalStore (server snapshot: "").

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSegment(): string {
  const path = window.location.hash.split("?")[0] ?? "";
  return path.replace(/^#\/?/, "").split("/")[0] ?? "";
}

function getServerSegment(): string {
  return "";
}

export function useHashSegment(): string {
  return useSyncExternalStore(subscribe, getSegment, getServerSegment);
}
