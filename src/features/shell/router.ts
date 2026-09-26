"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 3 hash router — the URL contract (braces = params):
//
//   #/today                          → screens/today          (—)
//   #/today/{exerciseId}             → screens/training       { exerciseId }
//   #/calendar                       → screens/calendar       (—)
//   #/calendar/filters               → screens/calendar-filters (—)
//   #/history                        → screens/history        (—)
//   #/exercises                      → screens/picker         (—)
//   #/routines                       → screens/routines       (—)
//   #/routines/{id}                  → screens/routine-detail { routineId }
//   #/routines/{id}/log/{dayId}      → screens/log-day        { routineId, dayId }
//   #/routines/{id}/exercise/{reId}  → screens/predefined-editor { routineId, reId }
//   #/body                           → screens/body           (—)
//   #/insights                       → screens/records        (—)
//   #/tools                          → screens/tools          (—)
//   #/settings                       → screens/settings       (—)
//   #/help                           → screens/help           (—)
//   #/auth                           → screens/auth           (—)
//   #/dev                            → screens/dev-showcase   (—)
//
//   #/exercise-overview/{id}         → screens/exercise-overview { exerciseId }
//
// Unknown hash → redirect to #/today. Query strings (?a=b) are preserved and
// exposed on Route.query. The router imports ONLY from src/features/screens/*
// so later agents replace screen files without touching this router.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export type RouteName =
  | "today"
  | "training"
  | "calendar"
  | "calendar-filters"
  | "history"
  | "exercises"
  | "routines"
  | "routine-detail"
  | "log-day"
  | "predefined-editor"
  | "body"
  | "insights"
  | "tools"
  | "settings"
  | "help"
  | "auth"
  | "dev"
  | "exercise-overview";

/** Params extracted from the URL contract (all optional — presence depends on route). */
export type RouteParams = {
  /** #/today/{exerciseId} */
  exerciseId?: string;
  /** #/routines/{id} (+ nested log-day / predefined-editor) */
  routineId?: string;
  /** #/routines/{id}/log/{dayId} */
  dayId?: string;
  /** #/routines/{id}/exercise/{reId} */
  reId?: string;
};

type RouteMeta = { query: URLSearchParams; hash: string };

export type Route =
  | ({ name: "today" } & RouteMeta)
  | ({ name: "training"; params: RouteParams & { exerciseId: string } } & RouteMeta)
  | ({ name: "calendar" } & RouteMeta)
  | ({ name: "calendar-filters" } & RouteMeta)
  | ({ name: "history" } & RouteMeta)
  | ({ name: "exercises" } & RouteMeta)
  | ({ name: "routines" } & RouteMeta)
  | ({ name: "routine-detail"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "log-day"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "predefined-editor"; params: RouteParams & { routineId: string; reId: string } } & RouteMeta)
  | ({ name: "body" } & RouteMeta)
  | ({ name: "insights" } & RouteMeta)
  | ({ name: "tools" } & RouteMeta)
  | ({ name: "settings" } & RouteMeta)
  | ({ name: "help" } & RouteMeta)
  | ({ name: "auth" } & RouteMeta)
  | ({ name: "dev" } & RouteMeta)
  | ({ name: "exercise-overview"; params: RouteParams & { exerciseId: string } } & RouteMeta);

/** Route used before the real hash is read (and on the server): #/today. */
export const HOME_ROUTE: Route = {
  name: "today",
  query: new URLSearchParams(),
  hash: "",
};

/**
 * Parse a location.hash into a Route. Returns null for hashes that match no
 * pattern in the URL contract (caller redirects those to #/today).
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
    case "today":
      if (segs.length === 0) return { name: "today", ...meta };
      if (segs.length === 1) return { name: "today", ...meta };
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

    case "routines": {
      if (segs.length === 1) return { name: "routines", ...meta };
      const id = segs[1];
      if (segs.length === 2 && id) return { name: "routine-detail", params: { routineId: id }, ...meta };
      const leaf = segs[2];
      const leafId = segs[3];
      if (segs.length === 4 && id && leaf === "log" && leafId) {
        return { name: "log-day", params: { routineId: id, dayId: leafId }, ...meta };
      }
      if (segs.length === 4 && id && leaf === "exercise" && leafId) {
        return { name: "predefined-editor", params: { routineId: id, reId: leafId }, ...meta };
      }
      return null;
    }

    case "body":
      return segs.length === 1 ? { name: "body", ...meta } : null;

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
 * applied immediately after mount. Unknown hashes redirect to #/today with
 * location.replace (no history pollution).
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(HOME_ROUTE);

  useEffect(() => {
    const apply = () => {
      const parsed = parseRoute(window.location.hash);
      if (!parsed) {
        window.location.replace(
          `${window.location.pathname}${window.location.search}#/today`,
        );
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
