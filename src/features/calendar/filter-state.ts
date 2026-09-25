"use client";

// Calendar filter state: sessionStorage persistence + client-side matching logic.
// Applies to the List view; the month grid always shows everything.

import type { WorkoutSummaryDTO } from "@/lib/types";
import { dayKeyOf } from "@/lib/client/format";

export type CalendarFilters = {
  categoryNames: string[]; // summaries expose {name, colour}; names are unique per user
  categoryMatch: "all" | "any";
  exerciseId: string | null;
  exerciseName: string | null;
  weightMin: number | null;
  repsMin: number | null;
  distanceMin: number | null;
  timeMinSec: number | null;
};

export const DEFAULT_FILTERS: CalendarFilters = {
  categoryNames: [],
  categoryMatch: "any",
  exerciseId: null,
  exerciseName: null,
  weightMin: null,
  repsMin: null,
  distanceMin: null,
  timeMinSec: null,
};

const STORAGE_KEY = "setforge:calendar-filters";

export function loadFilters(): CalendarFilters {
  if (typeof window === "undefined") return { ...DEFAULT_FILTERS };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as Partial<CalendarFilters>;
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      categoryNames: Array.isArray(parsed.categoryNames) ? parsed.categoryNames : [],
      categoryMatch: parsed.categoryMatch === "all" ? "all" : "any",
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(filters: CalendarFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* storage unavailable — session-only fallback */
  }
}

export function countActiveFilters(f: CalendarFilters): number {
  let n = 0;
  if (f.categoryNames.length > 0) n++;
  if (f.exerciseId) n++;
  if (
    f.exerciseId &&
    (f.weightMin != null || f.repsMin != null || f.distanceMin != null || f.timeMinSec != null)
  )
    n++;
  return n;
}

export function filtersAreActive(f: CalendarFilters): boolean {
  return countActiveFilters(f) > 0;
}

export type HistoryEntry = {
  workoutId: string;
  date: string;
  workoutExerciseId: string;
  sets: Array<{
    weight: number | null;
    reps: number | null;
    distance: number | null;
    timeSec: number | null;
  }>;
};

/**
 * Given exercise history entries, compute the set of workout ids that match the
 * exercise-condition filter. A workout matches if ANY of its sets for the exercise
 * satisfies ALL filled conditions (weight/reps/distance/timeSec >= thresholds).
 * Returns null when no exercise filter is active.
 */
export function exerciseMatchesFromHistory(
  history: HistoryEntry[] | undefined,
  f: CalendarFilters,
): Set<string> | null {
  if (!f.exerciseId) return null;
  if (!history) return new Set<string>();
  const filled: Array<["weight" | "reps" | "distance" | "timeSec", number]> = [];
  if (f.weightMin != null) filled.push(["weight", f.weightMin]);
  if (f.repsMin != null) filled.push(["reps", f.repsMin]);
  if (f.distanceMin != null) filled.push(["distance", f.distanceMin]);
  if (f.timeMinSec != null) filled.push(["timeSec", f.timeMinSec]);

  const matches = new Set<string>();
  for (const entry of history) {
    if (filled.length === 0) {
      // exercise picked without conditions → match any workout containing it
      matches.add(entry.workoutId);
      continue;
    }
    const ok = entry.sets.some((s) =>
      filled.every(([field, min]) => {
        const v = s[field];
        return v != null && v >= min;
      }),
    );
    if (ok) matches.add(entry.workoutId);
  }
  return matches;
}

/** Apply category + exercise filters to a list of workout summaries (newest first). */
export function applyFilters(
  workouts: WorkoutSummaryDTO[],
  f: CalendarFilters,
  exerciseMatches: Set<string> | null,
): WorkoutSummaryDTO[] {
  return workouts.filter((w) => {
    if (f.categoryNames.length > 0) {
      const names = w.categories.map((c) => c.name);
      const hit =
        f.categoryMatch === "all"
          ? f.categoryNames.every((n) => names.includes(n))
          : f.categoryNames.some((n) => names.includes(n));
      if (!hit) return false;
    }
    if (exerciseMatches && !exerciseMatches.has(w.id)) return false;
    return true;
  });
}

/** Index summaries by UTC day key. */
export function indexByDay(workouts: WorkoutSummaryDTO[]): Map<string, WorkoutSummaryDTO> {
  const map = new Map<string, WorkoutSummaryDTO>();
  for (const w of workouts) map.set(dayKeyOf(w.date), w);
  return map;
}

export type MonthGroup = { key: string; label: string; workouts: WorkoutSummaryDTO[] };

/** Group workouts (newest first) under month headings, newest month first. */
export function groupByMonth(workouts: WorkoutSummaryDTO[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();
  for (const w of workouts) {
    const d = new Date(w.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    let g = index.get(key);
    if (!g) {
      g = {
        key,
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
        workouts: [],
      };
      index.set(key, g);
      groups.push(g);
    }
    g.workouts.push(w);
  }
  return groups;
}
