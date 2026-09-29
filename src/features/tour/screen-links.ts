// ─────────────────────────────────────────────────────────────────────────────
// Screen id → hash map (Part 7).
//
// Parametric screens have no stable URL of their own (they need an id from
// data), so "Show me" / "Replay" links point at their PARENT screen, whose
// tour covers the shared surface. Everything else is `#/{screenId}`.
// Screen id === route name (src/features/shell/router.ts), 1:1.
// ─────────────────────────────────────────────────────────────────────────────

const PARAMETRIC_PARENT: Record<string, string> = {
  training: "#/today",
  "program-detail": "#/programs",
  "log-day": "#/programs",
  "predefined-editor": "#/programs",
  "program-day": "#/programs",
  "day-arrange": "#/programs",
  "library-entry": "#/library",
  "exercise-overview": "#/exercises",
  "schedule-pick": "#/calendar",
  "today-arrange": "#/today",
  "body-compare": "#/body",
};

/** Hash route for a screen id (parametric screens → their parent screen). */
export function screenHash(screenId: string): string {
  return PARAMETRIC_PARENT[screenId] ?? `#/${screenId}`;
}

/** Hash route for a screen id with `?tour=1` appended (force replay). */
export function screenTourHash(screenId: string): string {
  return `${screenHash(screenId)}?tour=1`;
}
