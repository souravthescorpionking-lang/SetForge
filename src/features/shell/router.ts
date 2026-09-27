"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 5 hash router — the URL contract (braces = params):
//
//   #/home                           → screens/home           (—)   NEW default
//   #/today                          → screens/today          (—)
//   #/today/{exerciseId}             → screens/training       { exerciseId }
//   #/calendar                       → screens/calendar       (—)
//   #/calendar/filters               → screens/calendar-filters (—)
//   #/history                        → screens/history        (—)
//   #/exercises                      → screens/picker         (—)
//   #/programs                       → screens/programs       (—)   NEW
//   #/programs/{id}                  → screens/program-detail { routineId }
//   #/programs/{id}/log/{dayId}      → screens/log-day        { routineId, dayId }
//   #/programs/{id}/exercise/{reId}  → screens/predefined-editor { routineId, reId }
//   #/schedule/pick?date=YYYY-MM-DD  → screens/schedule-pick  (—)   NEW
//   #/more                           → screens/more           (—)   NEW
//   #/body                           → screens/body           (—)
//   #/insights                       → screens/records        (—)
//   #/tools                          → screens/tools          (—)
//   #/settings                       → screens/settings       (—)
//   #/help                           → screens/help           (—)
//   #/auth                           → screens/auth           (—)
//   #/dev                            → screens/dev-showcase   (—)
//   #/exercise-overview/{id}         → screens/exercise-overview { exerciseId }
//
// LEGACY redirects (location.replace — no history pollution):
//   #/routines…  → #/programs…  (path-for-path)   ·  "" or "#/" → #/home
//   Any other unknown hash → #/home. Query strings (?a=b) are preserved and
//   exposed on Route.query. The router imports ONLY from src/features/screens/*
// so screen files can be replaced without touching this router.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export type RouteName =
  | "home"
  | "today"
  | "training"
  | "calendar"
  | "calendar-filters"
  | "history"
  | "exercises"
  | "programs"
  | "program-detail"
  | "log-day"
  | "predefined-editor"
  | "schedule-pick"
  | "more"
  | "body"
  | "insights"
  | "tools"
  | "settings"
  | "help"
  | "auth"
  | "dev"
  | "exercise-overview"
  // ---- Part 6 ----
  | "library"
  | "library-entry"
  | "program-day"
  | "day-arrange"
  | "today-arrange"
  | "program-builder"
  | "dictionary"
  | "onboarding"
  | "profile"
  | "body-compare";

/** Params extracted from the URL contract (all optional — presence depends on route). */
export type RouteParams = {
  /** #/today/{exerciseId} */
  exerciseId?: string;
  /** #/programs/{id} (+ nested log-day / predefined-editor / day / arrange) */
  routineId?: string;
  /** #/programs/{id}/log/{dayId} and #/programs/{id}/day/{dayId} */
  dayId?: string;
  /** #/programs/{id}/exercise/{reId} */
  reId?: string;
  /** #/library/{catalogKey} (Part 6) */
  catalogKey?: string;
};

type RouteMeta = { query: URLSearchParams; hash: string };

export type Route =
  | ({ name: "home" } & RouteMeta)
  | ({ name: "today" } & RouteMeta)
  | ({ name: "training"; params: RouteParams & { exerciseId: string } } & RouteMeta)
  | ({ name: "calendar" } & RouteMeta)
  | ({ name: "calendar-filters" } & RouteMeta)
  | ({ name: "history" } & RouteMeta)
  | ({ name: "exercises" } & RouteMeta)
  | ({ name: "programs" } & RouteMeta)
  | ({ name: "program-detail"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "log-day"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "predefined-editor"; params: RouteParams & { routineId: string; reId: string } } & RouteMeta)
  | ({ name: "schedule-pick" } & RouteMeta)
  | ({ name: "more" } & RouteMeta)
  | ({ name: "body" } & RouteMeta)
  | ({ name: "insights" } & RouteMeta)
  | ({ name: "tools" } & RouteMeta)
  | ({ name: "settings" } & RouteMeta)
  | ({ name: "help" } & RouteMeta)
  | ({ name: "auth" } & RouteMeta)
  | ({ name: "dev" } & RouteMeta)
  | ({ name: "exercise-overview"; params: RouteParams & { exerciseId: string } } & RouteMeta)
  // ---- Part 6 ----
  | ({ name: "library" } & RouteMeta)
  | ({ name: "library-entry"; params: RouteParams & { catalogKey: string } } & RouteMeta)
  | ({ name: "program-day"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "day-arrange"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "today-arrange" } & RouteMeta)
  | ({ name: "program-builder" } & RouteMeta)
  | ({ name: "dictionary" } & RouteMeta)
  | ({ name: "onboarding" } & RouteMeta)
  | ({ name: "profile" } & RouteMeta)
  | ({ name: "body-compare" } & RouteMeta);

/** Route used before the real hash is read (and on the server): #/home. */
export const HOME_ROUTE: Route = {
  name: "home",
  query: new URLSearchParams(),
  hash: "",
};

/**
 * Legacy/empty hash → its modern equivalent. Returns null when the hash is
 * already canonical (no rewrite needed). Pure function.
 */
export function canonicalHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const query = queryPart ? `?${queryPart}` : "";
  const segs = (pathPart ?? "").split("/").filter(Boolean);
  if (segs.length === 0) return `#/home${query}`;
  if (segs[0] === "routines") {
    const rest = segs.slice(1);
    return `#/programs${rest.length > 0 ? `/${rest.join("/")}` : ""}${query}`;
  }
  return null;
}

/**
 * Parse a location.hash into a Route. Returns null for hashes that match no
 * pattern in the URL contract (caller redirects those to #/home).
 * Pure function — safe on the server (pass "" for the SSR default).
 */
export function parseRoute(hash: string): Route | null {
  const raw = hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const query = new URLSearchParams(queryPart ?? "");
  const meta: RouteMeta = { query, hash };
  const segs = (pathPart ?? "").split("/").filter(Boolean);
  const head = segs[0] ?? "";

  switch (head) {
    case "":
    case "home":
      if (segs.length === 0) return { name: "home", ...meta };
      if (segs.length === 1) return { name: "home", ...meta };
      return null;

    case "today":
      if (segs.length === 0) return { name: "today", ...meta };
      if (segs.length === 1) return { name: "today", ...meta };
      if (segs.length === 2 && segs[1] === "arrange") return { name: "today-arrange", ...meta }; // Part 6
      if (segs.length === 2) return { name: "training", params: { exerciseId: segs[1] }, ...meta };
      return null;

    case "calendar":
      if (segs.length === 1) return { name: "calendar", ...meta };
      if (segs.length === 2 && segs[1] === "filters") return { name: "calendar-filters", ...meta };
      return null;

    case "history":
      return segs.length === 1 ? { name: "history", ...meta } : null;

    case "exercises":
      return segs.length === 1 ? { name: "exercises", ...meta } : null;

    case "programs":
    case "routines": {
      // "routines" parses identically (deep links written before Part 5 that
      // slip through the canonical rewrite still resolve; useHashRoute
      // additionally replaces the URL so the address bar shows #/programs).
      if (segs.length === 1) return { name: "programs", ...meta };
      // Part 6: #/programs/new/builder (must precede the generic {id} match)
      if (segs.length === 3 && segs[1] === "new" && segs[2] === "builder") {
        return { name: "program-builder", ...meta };
      }
      const id = segs[1];
      if (segs.length === 2 && id && id !== "new") return { name: "program-detail", params: { routineId: id }, ...meta };
      const leaf = segs[2];
      const leafId = segs[3];
      if (segs.length === 4 && id && leaf === "log" && leafId) {
        return { name: "log-day", params: { routineId: id, dayId: leafId }, ...meta };
      }
      if (segs.length === 4 && id && leaf === "exercise" && leafId) {
        return { name: "predefined-editor", params: { routineId: id, reId: leafId }, ...meta };
      }
      // Part 6: #/programs/{id}/day/{dayId} (+ /arrange)
      if (segs.length === 4 && id && leaf === "day" && leafId) {
        return { name: "program-day", params: { routineId: id, dayId: leafId }, ...meta };
      }
      if (segs.length === 5 && id && leaf === "day" && leafId && segs[4] === "arrange") {
        return { name: "day-arrange", params: { routineId: id, dayId: leafId }, ...meta };
      }
      return null;
    }

    case "schedule":
      if (segs.length === 2 && segs[1] === "pick") return { name: "schedule-pick", ...meta };
      return null;

    case "more":
      return segs.length === 1 ? { name: "more", ...meta } : null;

    case "body":
      if (segs.length === 1) return { name: "body", ...meta };
      if (segs.length === 2 && segs[1] === "compare") return { name: "body-compare", ...meta }; // Part 6
      return null;

    case "insights":
      return segs.length === 1 ? { name: "insights", ...meta } : null;

    case "tools":
      return segs.length === 1 ? { name: "tools", ...meta } : null;

    case "settings":
      return segs.length === 1 ? { name: "settings", ...meta } : null;

    case "help":
      return segs.length === 1 ? { name: "help", ...meta } : null;

    case "auth":
      return segs.length === 1 ? { name: "auth", ...meta } : null;

    case "dev":
      return segs.length === 1 ? { name: "dev", ...meta } : null;

    case "exercise-overview":
      if (segs.length === 2 && segs[1]) {
        return { name: "exercise-overview", params: { exerciseId: segs[1] }, ...meta };
      }
      return null;

    // ---- Part 6 routes ----

    case "library":
      if (segs.length === 1) return { name: "library", ...meta };
      if (segs.length === 2 && segs[1]) return { name: "library-entry", params: { catalogKey: decodeURIComponent(segs[1]) }, ...meta };
      return null;

    case "dictionary":
      return segs.length === 1 ? { name: "dictionary", ...meta } : null;

    case "onboarding":
      return segs.length === 1 ? { name: "onboarding", ...meta } : null;

    case "profile":
      return segs.length === 1 ? { name: "profile", ...meta } : null;

    default:
      return null;
  }
}

function sameRoute(a: Route, b: Route): boolean {
  return a.name === b.name && a.hash === b.hash;
}

/**
 * Hash-route state hook. Listens to hashchange (browser back/forward work;
 * deep links resolve via the mount effect). Initial state is the home route on
 * both server and first client render (hydration-safe); the real hash is
 * applied immediately after mount. Legacy #/routines* hashes are rewritten to
 * their #/programs* equivalents and unknown hashes to #/home — both via
 * location.replace (no history pollution).
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(HOME_ROUTE);

  useEffect(() => {
    const apply = () => {
      const rewritten = canonicalHash(window.location.hash);
      if (rewritten != null) {
        window.location.replace(`${window.location.pathname}${window.location.search}${rewritten}`);
        return; // the replace triggers another hashchange → parsed next tick
      }
      const parsed = parseRoute(window.location.hash);
      if (!parsed) {
        window.location.replace(`${window.location.pathname}${window.location.search}#/home`);
        return;
      }
      setRoute((prev) => (sameRoute(prev, parsed) ? prev : parsed));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return route;
}

/** Replace the current history entry's hash (redirect without history pollution). */
export function replaceHash(hash: string): void {
  if (window.location.hash === hash) return;
  window.location.replace(`${window.location.pathname}${window.location.search}${hash}`);
}
