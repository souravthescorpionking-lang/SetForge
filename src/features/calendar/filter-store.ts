"use client";

// filter-store.ts — the shared calendar-filter state (p3-6).
//
// Wraps the LEGACY filter-state module (sessionStorage persistence + the
// matching logic that p3-9 will delete together with the legacy views) in a
// module-level observable so #/calendar and #/calendar/filters share ONE state
// across route mounts/unmounts. The screens read it through useCalendarFilters
// (useSyncExternalStore) and mutate through the patch helpers.

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FILTERS,
  loadFilters,
  saveFilters,
  type CalendarFilters,
} from "./filter-state";

// loadFilters guards typeof window (SSR-safe → DEFAULT_FILTERS on the server).
let state: CalendarFilters = loadFilters();

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Replace the whole filter state (persists via the legacy store). */
export function setCalendarFilters(next: CalendarFilters): void {
  state = next;
  saveFilters(next);
  emit();
}

/** Shallow-merge a patch into the shared filter state. */
export function patchCalendarFilters(patch: Partial<CalendarFilters>): void {
  setCalendarFilters({ ...state, ...patch });
}

/** Back to DEFAULT_FILTERS (the filters screen's Reset action). */
export function resetCalendarFilters(): void {
  setCalendarFilters({ ...DEFAULT_FILTERS });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CalendarFilters {
  return state;
}

/** Live calendar filters across every screen (router-level shared state). */
export function useCalendarFilters(): CalendarFilters {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
