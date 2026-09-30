"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Part 8 hash router — the phone-only URL contract (braces = params):
//
//   #/workout                                  → screens/workout            (—)   tab 1 · default
//   #/dashboard                                → screens/dashboard          (—)   tab 2
//   #/more                                     → screens/more               (—)   tab 3
//   #/session                                  → screens/session            (—)   Logging (Start/Continue only; gated)
//   #/session/settings                         → screens/session-settings   (—)   Part 10 §3.5 live-session settings
//   #/session/exercise/{workoutExerciseId}     → screens/session-exercise   { exerciseId }
//   #/session/arrange                          → screens/session-arrange    (—)
//   #/logs                                     → screens/logs               (—)
//   #/logs/{workoutId}                         → screens/log-detail         { workoutId }
//   #/programs                                 → screens/programs           (—)   view only
//   #/programs/{id}                            → screens/program-detail     { routineId }
//   #/programs/{id}/day/{dayId}                → screens/program-day        { routineId, dayId }
//   #/programs/{id}/day/{dayId}/arrange        → screens/day-arrange        { routineId, dayId }
//   #/days/{dayId}                             → screens/day                { dayId }   Part 9 §5
//   #/days/{dayId}/rearrange                   → screens/day-rearrange      { dayId }   §5.1
//   #/days/{dayId}/replace/{reId}              → screens/day-replace        { dayId, reId } §5.2
//   #/days/{dayId}/notes/{reId}                → screens/day-notes          { dayId, reId } §5.4
//   #/on-demand                                → screens/on-demand          (—)
//   #/on-demand/{id}                           → screens/on-demand-detail   { routineId }
//   #/on-demand/filters                        → screens/on-demand-filters  (—)   Part 9 §7
//   #/account/subscription|support|social|delete → screens/account-*        (—)   Part 9 §9
//   #/library                                  → screens/library            (—)
//   #/library/{catalogKey}                     → screens/library-entry      { catalogKey }
//   #/builder                                  → screens/builder            (—)   hub
//   #/builder/new                              → screens/builder-new        (—)   creation wizard
//   #/builder/program/{id}                     → screens/builder-program    { routineId }
//   #/builder/session/new                      → screens/builder-session-new (—)   Part 10 §4.2 draft build
//   #/builder/session/{id}                     → screens/builder-session    { routineId }
//   #/builder/session/{id|new}/add             → screens/builder-add        { routineId }   Part 10 §4.3
//   #/builder/session/{id|new}/add/selected    → screens/builder-add-selected { routineId } §4.3
//   #/builder/program/{id}/exercise/{reId}     → screens/sets-editor        { routineId, reId }
//   #/builder/session/{id}/exercise/{reId}     → screens/sets-editor        { routineId, reId }
//   #/filters/muscle · #/filters/equipment     → screens/filters-*          (—)   Part 10 §4.4 shared
//   #/tempo/{reId}                             → screens/tempo              { reId }        Part 10 §4.6
//   #/calendar                                 → screens/calendar           (—)   via 📅
//   #/calendar/filters                         → screens/calendar-filters   (—)
//   #/schedule/pick?date=YYYY-MM-DD            → screens/schedule-pick      (—)
//   #/exercises                                → screens/picker             (—)   library picker
//   #/exercise-overview/{id}                   → screens/exercise-overview  { exerciseId }
//   #/body, #/body/compare, #/insights, #/tools, #/dictionary,
//   #/profile, #/settings, #/help, #/auth, #/dev, #/onboarding        (kept; reached via More)
//
// LEGACY redirects (location.replace — no history pollution; kept for 3 releases):
//   "" | "#/" | "#/home"            → #/workout          (Part 8 removed the Home hub)
//   #/today…                        → #/session…         (Logging route renamed)
//   #/history                       → #/logs
//   #/programs/new/builder          → #/builder/new
//   #/programs/{id}/log/{dayId}     → #/programs/{id}    (log-day preview folded into Start)
//   #/programs/{id}/exercise/{reId} → #/builder/program/{id}/exercise/{reId}
//   #/routines…                     → #/programs…        (Part 5 legacy)
//   Any other unknown hash → #/workout. Query strings (?a=b) are preserved and
//   exposed on Route.query. The router imports ONLY from src/features/screens/*
// so screen files can be replaced without touching this router.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export type RouteName =
  | "workout"
  | "dashboard"
  | "more"
  | "session"
  | "session-settings"
  | "session-exercise"
  | "session-arrange"
  | "logs"
  | "log-detail"
  | "programs"
  | "program-detail"
  | "program-day"
  | "day-arrange"
  | "day"
  | "day-rearrange"
  | "day-replace"
  | "day-notes"
  | "on-demand"
  | "on-demand-detail"
  | "on-demand-filters"
  | "library"
  | "library-entry"
  | "builder"
  | "builder-new"
  | "builder-program"
  | "builder-session"
  | "builder-session-new"
  | "builder-add"
  | "builder-add-selected"
  | "sets-editor"
  | "filters-muscle"
  | "filters-equipment"
  | "tempo"
  | "calendar"
  | "calendar-filters"
  | "schedule-pick"
  | "exercises"
  | "exercise-overview"
  | "body"
  | "body-compare"
  | "insights"
  | "tools"
  | "dictionary"
  | "onboarding"
  | "profile"
  | "settings"
  | "help"
  | "auth"
  | "account-subscription"
  | "account-support"
  | "account-social"
  | "account-delete"
  | "account-privacy"
  | "account-terms"
  | "dev";

/** Params extracted from the URL contract (all optional — presence depends on route). */
export type RouteParams = {
  /** #/session/exercise/{workoutExerciseId} */
  exerciseId?: string;
  /** #/programs/{id} and every nested program/builder route. */
  routineId?: string;
  /** #/programs/{id}/day/{dayId} (+ /arrange) and #/days/{dayId}(+ /rearrange|/replace|/notes) */
  dayId?: string;
  /** #/builder/(program|session)/{id}/exercise/{reId} + #/days/{dayId}/(replace|notes)/{reId} */
  reId?: string;
  /** #/logs/{workoutId} */
  workoutId?: string;
  /** #/library/{catalogKey} */
  catalogKey?: string;
};

type RouteMeta = { query: URLSearchParams; hash: string };

export type Route =
  | ({ name: "workout" } & RouteMeta)
  | ({ name: "dashboard" } & RouteMeta)
  | ({ name: "more" } & RouteMeta)
  | ({ name: "session" } & RouteMeta)
  | ({ name: "session-settings" } & RouteMeta)
  | ({ name: "session-exercise"; params: RouteParams & { exerciseId: string } } & RouteMeta)
  | ({ name: "session-arrange" } & RouteMeta)
  | ({ name: "logs" } & RouteMeta)
  | ({ name: "log-detail"; params: RouteParams & { workoutId: string } } & RouteMeta)
  | ({ name: "programs" } & RouteMeta)
  | ({ name: "program-detail"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "program-day"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "day-arrange"; params: RouteParams & { routineId: string; dayId: string } } & RouteMeta)
  | ({ name: "day"; params: RouteParams & { dayId: string } } & RouteMeta)
  | ({ name: "day-rearrange"; params: RouteParams & { dayId: string } } & RouteMeta)
  | ({ name: "day-replace"; params: RouteParams & { dayId: string; reId: string } } & RouteMeta)
  | ({ name: "day-notes"; params: RouteParams & { dayId: string; reId: string } } & RouteMeta)
  | ({ name: "on-demand" } & RouteMeta)
  | ({ name: "on-demand-detail"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "on-demand-filters" } & RouteMeta)
  | ({ name: "library" } & RouteMeta)
  | ({ name: "library-entry"; params: RouteParams & { catalogKey: string } } & RouteMeta)
  | ({ name: "builder" } & RouteMeta)
  | ({ name: "builder-new" } & RouteMeta)
  | ({ name: "builder-program"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "builder-session"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "builder-session-new" } & RouteMeta)
  | ({ name: "builder-add"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "builder-add-selected"; params: RouteParams & { routineId: string } } & RouteMeta)
  | ({ name: "sets-editor"; params: RouteParams & { routineId: string; reId: string } } & RouteMeta)
  | ({ name: "filters-muscle" } & RouteMeta)
  | ({ name: "filters-equipment" } & RouteMeta)
  | ({ name: "tempo"; params: RouteParams & { reId: string } } & RouteMeta)
  | ({ name: "calendar" } & RouteMeta)
  | ({ name: "calendar-filters" } & RouteMeta)
  | ({ name: "schedule-pick" } & RouteMeta)
  | ({ name: "exercises" } & RouteMeta)
  | ({ name: "exercise-overview"; params: RouteParams & { exerciseId: string } } & RouteMeta)
  | ({ name: "body" } & RouteMeta)
  | ({ name: "body-compare" } & RouteMeta)
  | ({ name: "insights" } & RouteMeta)
  | ({ name: "tools" } & RouteMeta)
  | ({ name: "dictionary" } & RouteMeta)
  | ({ name: "onboarding" } & RouteMeta)
  | ({ name: "profile" } & RouteMeta)
  | ({ name: "settings" } & RouteMeta)
  | ({ name: "help" } & RouteMeta)
  | ({ name: "auth" } & RouteMeta)
  | ({ name: "account-subscription" } & RouteMeta)
  | ({ name: "account-support" } & RouteMeta)
  | ({ name: "account-social" } & RouteMeta)
  | ({ name: "account-delete" } & RouteMeta)
  | ({ name: "account-privacy" } & RouteMeta)
  | ({ name: "account-terms" } & RouteMeta)
  | ({ name: "dev" } & RouteMeta);

/** Route used before the real hash is read (and on the server): #/workout. */
export const HOME_ROUTE: Route = {
  name: "workout",
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
  if (segs.length === 0) return `#/workout${query}`;
  const head = segs[0];

  // Part 5 legacy: routines → programs (path-for-path).
  if (head === "routines") {
    const rest = segs.slice(1);
    return `#/programs${rest.length > 0 ? `/${rest.join("/")}` : ""}${query}`;
  }

  // Part 8 legacy rewrites (keep for 3 releases).
  if (head === "home") return `#/workout${query}`;
  if (head === "today") {
    if (segs.length <= 1) return `#/session${query}`;
    if (segs[1] === "arrange") return `#/session/arrange${query}`;
    return `#/session/exercise/${segs.slice(1).join("/")}${query}`;
  }
  if (head === "history") return `#/logs${query}`;

  // Part 9 legacy rewrites: program-scoped day routes → day-first routes.
  if (head === "programs" && segs.length >= 4 && segs[2] === "day" && segs[3]) {
    const id = segs[1];
    const dayId = segs[3];
    if (segs.length === 5 && segs[4] === "arrange") return `#/days/${dayId}/rearrange${query}`;
    if (segs.length === 4) return `#/days/${dayId}${query}`;
    void id;
  }

  if (head === "programs" && segs.length >= 3) {
    const id = segs[1];
    if (id === "new" && segs[2] === "builder") return `#/builder/new${query}`;
    if (segs[2] === "log" && segs[3]) return `#/programs/${id}${query}`;
    if (segs[2] === "exercise" && segs[3]) {
      return `#/builder/program/${id}/exercise/${segs[3]}${query}`;
    }
  }
  return null;
}

/**
 * Parse a location.hash into a Route. Returns null for hashes that match no
 * pattern in the URL contract (caller redirects those to #/workout).
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
    case "workout":
      return segs.length <= 1 ? { name: "workout", ...meta } : null;

    case "dashboard":
      return segs.length === 1 ? { name: "dashboard", ...meta } : null;

    case "more":
      return segs.length === 1 ? { name: "more", ...meta } : null;

    // ---- Logging (§3.10): only reachable via Start/Continue; the screen
    // itself redirects to #/workout when no session is in progress. ----
    case "session":
      if (segs.length <= 1) return { name: "session", ...meta };
      if (segs[1] === "settings") return { name: "session-settings", ...meta };
      if (segs[1] === "arrange") return { name: "session-arrange", ...meta };
      if (segs[1] === "exercise" && segs[2]) {
        return { name: "session-exercise", params: { exerciseId: segs[2] }, ...meta };
      }
      return null;

    case "logs":
      if (segs.length <= 1) return { name: "logs", ...meta };
      if (segs.length === 2 && segs[1]) return { name: "log-detail", params: { workoutId: segs[1] }, ...meta };
      return null;

    case "programs": {
      if (segs.length === 1) return { name: "programs", ...meta };
      const id = segs[1];
      if (segs.length === 2 && id && id !== "new") return { name: "program-detail", params: { routineId: id }, ...meta };
      const leaf = segs[2];
      const leafId = segs[3];
      if (id && leaf === "day" && leafId) {
        if (segs.length === 4) return { name: "program-day", params: { routineId: id, dayId: leafId }, ...meta };
        if (segs.length === 5 && segs[4] === "arrange") {
          return { name: "day-arrange", params: { routineId: id, dayId: leafId }, ...meta };
        }
      }
      return null;
    }

    case "on-demand":
      if (segs.length === 1) return { name: "on-demand", ...meta };
      if (segs.length === 2 && segs[1] === "filters") return { name: "on-demand-filters", ...meta };
      if (segs.length === 2 && segs[1]) return { name: "on-demand-detail", params: { routineId: segs[1] }, ...meta };
      return null;

    // ---- Part 9 §5: day-first routes (program days, on-demand days, log template view) ----
    case "days": {
      if (segs.length >= 2 && segs[1]) {
        const dayId = segs[1];
        if (segs.length === 2) return { name: "day", params: { dayId }, ...meta };
        if (segs.length === 3 && segs[2] === "rearrange") return { name: "day-rearrange", params: { dayId }, ...meta };
        if (segs.length === 4 && segs[2] === "replace" && segs[3]) {
          return { name: "day-replace", params: { dayId, reId: segs[3] }, ...meta };
        }
        if (segs.length === 4 && segs[2] === "notes" && segs[3]) {
          return { name: "day-notes", params: { dayId, reId: segs[3] }, ...meta };
        }
      }
      return null;
    }

    // ---- Part 9 §9: account destinations (via More) ----
    case "account":
      if (segs.length === 2 && segs[1] === "subscription") return { name: "account-subscription", ...meta };
      if (segs.length === 2 && segs[1] === "support") return { name: "account-support", ...meta };
      if (segs.length === 2 && segs[1] === "social") return { name: "account-social", ...meta };
      if (segs.length === 2 && segs[1] === "delete") return { name: "account-delete", ...meta };
      if (segs.length === 2 && segs[1] === "privacy") return { name: "account-privacy", ...meta };
      if (segs.length === 2 && segs[1] === "terms") return { name: "account-terms", ...meta };
      return null;

    case "library":
      if (segs.length === 1) return { name: "library", ...meta };
      if (segs.length === 2 && segs[1]) return { name: "library-entry", params: { catalogKey: decodeURIComponent(segs[1]) }, ...meta };
      return null;

    case "builder": {
      if (segs.length === 1) return { name: "builder", ...meta };
      if (segs.length === 2 && segs[1] === "new") return { name: "builder-new", ...meta };
      const kind = segs[1]; // program | session
      const id = segs[2];
      if ((kind === "program" || kind === "session") && id) {
        if (segs.length === 3) {
          // Part 10 §4.2: #/builder/session/new — the DRAFT build screen (the
          // program side keeps the wizard as its only creation path).
          if (id === "new") {
            return kind === "session" ? { name: "builder-session-new", ...meta } : null;
          }
          return kind === "program"
            ? { name: "builder-program", params: { routineId: id }, ...meta }
            : { name: "builder-session", params: { routineId: id }, ...meta };
        }
        // Part 10 §4.3: add-exercise flow (draft "new" or a persisted session).
        if (segs.length === 4 && segs[3] === "add") {
          return { name: "builder-add", params: { routineId: id }, ...meta };
        }
        if (segs.length === 5 && segs[3] === "add" && segs[4] === "selected") {
          return { name: "builder-add-selected", params: { routineId: id }, ...meta };
        }
        if (segs.length === 5 && segs[3] === "exercise" && segs[4]) {
          return { name: "sets-editor", params: { routineId: id, reId: segs[4] }, ...meta };
        }
      }
      return null;
    }

    // ---- Part 10 §4.4: shared filter routes (state round-trips in the URL) ----
    case "filters":
      if (segs.length === 2 && segs[1] === "muscle") return { name: "filters-muscle", ...meta };
      if (segs.length === 2 && segs[1] === "equipment") return { name: "filters-equipment", ...meta };
      return null;

    // ---- Part 10 §4.6: tempo picker (persisted RoutineExercise) ----
    case "tempo":
      if (segs.length === 2 && segs[1]) {
        return { name: "tempo", params: { reId: segs[1] }, ...meta };
      }
      return null;

    case "calendar":
      if (segs.length === 1) return { name: "calendar", ...meta };
      if (segs.length === 2 && segs[1] === "filters") return { name: "calendar-filters", ...meta };
      return null;

    case "schedule":
      if (segs.length === 2 && segs[1] === "pick") return { name: "schedule-pick", ...meta };
      return null;

    case "exercises":
      return segs.length === 1 ? { name: "exercises", ...meta } : null;

    case "exercise-overview":
      if (segs.length === 2 && segs[1]) {
        return { name: "exercise-overview", params: { exerciseId: segs[1] }, ...meta };
      }
      return null;

    case "body":
      if (segs.length === 1) return { name: "body", ...meta };
      if (segs.length === 2 && segs[1] === "compare") return { name: "body-compare", ...meta };
      return null;

    case "insights":
      return segs.length === 1 ? { name: "insights", ...meta } : null;

    case "tools":
      return segs.length === 1 ? { name: "tools", ...meta } : null;

    case "dictionary":
      return segs.length === 1 ? { name: "dictionary", ...meta } : null;

    case "onboarding":
      return segs.length === 1 ? { name: "onboarding", ...meta } : null;

    case "profile":
      return segs.length === 1 ? { name: "profile", ...meta } : null;

    case "settings":
      return segs.length === 1 ? { name: "settings", ...meta } : null;

    case "help":
      return segs.length === 1 ? { name: "help", ...meta } : null;

    case "auth":
      return segs.length === 1 ? { name: "auth", ...meta } : null;

    case "dev":
      return segs.length === 1 ? { name: "dev", ...meta } : null;

    default:
      return null;
  }
}

function sameRoute(a: Route, b: Route): boolean {
  return a.name === b.name && a.hash === b.hash;
}

/**
 * Hash-route state hook. Listens to hashchange (browser back/forward work;
 * deep links resolve via the mount effect). Initial state is the workout route
 * on both server and first client render (hydration-safe); the real hash is
 * applied immediately after mount. Legacy hashes are rewritten to their modern
 * equivalents and unknown hashes to #/workout — both via location.replace
 * (no history pollution).
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
        window.location.replace(`${window.location.pathname}${window.location.search}#/workout`);
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
