"use client";

// ─────────────────────────────────────────────────────────────────────────────
// add-flow-url — the §4.3/§4.4 URL contract of the builder add-exercise flow.
//
//   #/builder/session/{id|new}/add?series=new|{seriesId}
//       &q={search}            (written on navigate-away, not per keystroke)
//       &muscles={csv}         (§4.4 filter KEYS — expanded to enums at query)
//       &equipment={csv}       (§4.4 canonical ids — server expands)
//       &selected={csv}        (picked exercise ids, in pick order)
//
// ALL flow state lives in the add route's URL: selection taps use
// replaceHash (no history entry), the filter routes (#/filters/muscle ·
// #/filters/equipment) receive the whole add hash in ?return= and Apply
// navigates back with their dimension replaced — one implementation, three
// entry points (Builder-add, Library, Replace).
// ─────────────────────────────────────────────────────────────────────────────

/** The add-route query state that round-trips through the URL. */
export type AddFlowQuery = {
  series: string;
  q: string;
  muscles: string[];
  equipment: string[];
  selected: string[];
};

const csv = (values: string[]): string => values.filter(Boolean).join(",");
const listOf = (raw: string | null): string[] =>
  raw ? raw.split(",").map((v) => v.trim()).filter(Boolean) : [];

export const EMPTY_ADD_FLOW: AddFlowQuery = {
  series: "new",
  q: "",
  muscles: [],
  equipment: [],
  selected: [],
};

/** Parse the add-route state from a URLSearchParams (query of the add route). */
export function parseAddFlowQuery(query: URLSearchParams): AddFlowQuery {
  return {
    series: query.get("series") || "new",
    q: query.get("q") ?? "",
    muscles: listOf(query.get("muscles")),
    equipment: listOf(query.get("equipment")),
    selected: listOf(query.get("selected")),
  };
}

/** Build the add-route hash with the given state. */
export function addExerciseHash(routineId: string, state: AddFlowQuery): string {
  const params = new URLSearchParams();
  if (state.series && state.series !== "new") params.set("series", state.series);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.muscles.length > 0) params.set("muscles", csv(state.muscles));
  if (state.equipment.length > 0) params.set("equipment", csv(state.equipment));
  if (state.selected.length > 0) params.set("selected", csv(state.selected));
  const qs = params.toString();
  return `#/builder/session/${routineId}/add${qs ? `?${qs}` : ""}`;
}

/**
 * The hash query of the CURRENT location at first render (these screens mount
 * only after the shell route synced, so the hash is already theirs). SSR-safe.
 */
export function initialHashQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash.replace(/^#/, "");
  const queryPart = raw.split("?")[1] ?? "";
  return new URLSearchParams(queryPart);
}

/** Re-read the location hash query (hashchange listener bodies call this). */
export function currentHashQuery(): URLSearchParams {
  return initialHashQuery();
}

/**
 * Replace (or remove, when empty) ONE query param of a hash URL, keeping the
 * path and every other param — the ?return= round-trip primitive the shared
 * filter routes use (§4.4 "one implementation, three entry points").
 */
export function withQueryParam(hash: string, key: string, values: string[]): string {
  const [path, queryPart] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(queryPart ?? "");
  const value = values.filter(Boolean).join(",");
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}
