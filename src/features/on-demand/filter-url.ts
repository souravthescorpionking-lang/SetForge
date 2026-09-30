"use client";

// ─────────────────────────────────────────────────────────────────────────────
// filter-url.ts — the §7 On Demand URL-state contract, shared by
// #/on-demand (list) and #/on-demand/filters (full-screen filters).
//
// THE URL IS THE SOURCE OF TRUTH: the list screen derives every filter from
// its hash query, the filters screen edits a draft and writes it back with
// Apply, and a refresh/deep link restores the exact view. Query params:
//
//   q          search text (list SubBar; debounced write)
//   category   WARMUP_REHAB | SPECIALIZATION | LIMITED_EQUIPMENT | LIMITED_TIME
//              (the §7 chips; "All" = absent)
//   fav=1      Favorites chip (DayFavorite)
//   picks=1    Coach picks chip (isFeatured)
//   intensity  csv ⊆ BEGINNER,INTERMEDIATE,ADVANCED      (filters screen)
//   muscles    csv ⊆ the 12 §7 target areas incl. CORE   (filters screen)
//   duration   LE20 | 20_45 | GE45                        (filters screen)
//   equipment  csv ⊆ NONE,MINIMAL,GYM                     (filters screen)
// ─────────────────────────────────────────────────────────────────────────────

import type { OnDemandQuery } from "@/lib/client/api";

/** The 12 §7 target areas → exercise primaryMuscles values. */
export const TARGET_AREAS = [
  { key: "BACK", label: "Back" },
  { key: "BICEPS", label: "Biceps" },
  { key: "FOREARMS", label: "Forearms" },
  { key: "TRICEPS", label: "Triceps" },
  { key: "SHOULDERS", label: "Shoulders" },
  { key: "TRAPS", label: "Traps" },
  { key: "CORE", label: "Core" },
  { key: "CHEST", label: "Chest" },
  { key: "QUADS", label: "Quads" },
  { key: "CALVES", label: "Calves" },
  { key: "GLUTES", label: "Glutes" },
  { key: "HAMSTRINGS", label: "Hamstrings" },
] as const;

export type TargetArea = (typeof TARGET_AREAS)[number]["key"];

const CATEGORY_CHIPS = [
  "WARMUP_REHAB",
  "SPECIALIZATION",
  "LIMITED_EQUIPMENT",
  "LIMITED_TIME",
] as const;

const INTENSITIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const DURATION_BANDS = ["LE20", "20_45", "GE45"] as const;
const EQUIPMENT_LEVELS = ["NONE", "MINIMAL", "GYM"] as const;

/** §7 chip ids (single-select; ALL = none of the others). */
export type OnDemandChip = "ALL" | "FAV" | "PICKS" | (typeof CATEGORY_CHIPS)[number];

export type OnDemandUrlFilters = {
  q: string;
  chip: OnDemandChip;
  intensity: string[];
  muscles: string[];
  duration: string | null;
  equipment: string[];
};

export const EMPTY_ON_DEMAND_FILTERS: OnDemandUrlFilters = {
  q: "",
  chip: "ALL",
  intensity: [],
  muscles: [],
  duration: null,
  equipment: [],
};

function csvOf(raw: string | null, allowed: readonly string[]): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => (allowed as readonly string[]).includes(v));
}

/** Parse the #/on-demand hash query into the filter state (unknown values dropped). */
export function parseOnDemandFilters(query: URLSearchParams): OnDemandUrlFilters {
  const category = query.get("category");
  const chip: OnDemandChip =
    query.get("fav") === "1"
      ? "FAV"
      : query.get("picks") === "1"
        ? "PICKS"
        : (CATEGORY_CHIPS as readonly string[]).includes(category ?? "")
          ? (category as OnDemandChip)
          : "ALL";
  const duration = query.get("duration");
  return {
    q: query.get("q") ?? "",
    chip,
    intensity: csvOf(query.get("intensity"), INTENSITIES),
    muscles: csvOf(query.get("muscles"), TARGET_AREAS.map((t) => t.key)),
    duration: (DURATION_BANDS as readonly string[]).includes(duration ?? "") ? duration : null,
    equipment: csvOf(query.get("equipment"), EQUIPMENT_LEVELS),
  };
}

/** Serialize the filter state back to query params (empty values omitted). */
export function onDemandFiltersParams(f: OnDemandUrlFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.chip === "FAV") params.set("fav", "1");
  else if (f.chip === "PICKS") params.set("picks", "1");
  else if (f.chip !== "ALL") params.set("category", f.chip);
  if (f.intensity.length > 0) params.set("intensity", f.intensity.join(","));
  if (f.muscles.length > 0) params.set("muscles", f.muscles.join(","));
  if (f.duration) params.set("duration", f.duration);
  if (f.equipment.length > 0) params.set("equipment", f.equipment.join(","));
  return params;
}

/** The #/on-demand hash for a filter state (no query when everything is empty). */
export function onDemandListHash(f: OnDemandUrlFilters): string {
  const params = onDemandFiltersParams(f);
  const qs = params.toString();
  return qs ? `#/on-demand?${qs}` : "#/on-demand";
}

/** The #/on-demand/filters hash carrying the CURRENT list state (so the
 *  filters screen opens pre-populated and Apply can pass `q`/chip through). */
export function onDemandFiltersHash(f: OnDemandUrlFilters): string {
  const params = onDemandFiltersParams(f);
  const qs = params.toString();
  return qs ? `#/on-demand/filters?${qs}` : "#/on-demand/filters";
}

/** CORE expands to the ABS + OBLIQUES primary-muscle values. */
function musclesToApi(areas: string[]): string[] {
  const out = new Set<string>();
  for (const a of areas) {
    if (a === "CORE") {
      out.add("ABS");
      out.add("OBLIQUES");
    } else {
      out.add(a);
    }
  }
  return [...out];
}

/** Server-facing query params for onDemandApi.list (§7 server filtering). */
export function toOnDemandQuery(f: OnDemandUrlFilters): OnDemandQuery {
  return {
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.chip !== "ALL" && f.chip !== "FAV" && f.chip !== "PICKS" ? { category: f.chip } : {}),
    ...(f.intensity.length > 0 ? { intensity: f.intensity } : {}),
    ...(f.muscles.length > 0 ? { muscles: musclesToApi(f.muscles) } : {}),
    ...(f.duration ? { duration: f.duration } : {}),
    ...(f.equipment.length > 0 ? { equipment: f.equipment } : {}),
  };
}

/** Active filter-screen dimensions (the TopBar filter badge count). */
export function countOnDemandFilters(f: OnDemandUrlFilters): number {
  return f.intensity.length + f.muscles.length + (f.duration ? 1 : 0) + f.equipment.length;
}
