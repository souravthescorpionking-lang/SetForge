"use client";

// Screen slot — #/calendar/filters
// Part 3 rebuild (p3-6): the full-screen Calendar filters view. All layout,
// data wiring and interactions live in src/features/calendar/filters-screen.tsx;
// this slot stays a thin re-export so the router/shell never needs edits.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// NOTE: the step prefix is the camelCase "calendarFilters." — tour-gen's id
// grammar forbids hyphens in the prefix half.
const SCREEN = registerScreen({
  id: "calendar-filters",
  title: "Filters",
  purpose: "Narrow the calendar and history lists by category, exercise and set conditions.",
});
void SCREEN;

export { default } from "@/features/calendar/filters-screen";
