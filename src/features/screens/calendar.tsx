"use client";

// Screen slot — #/calendar
// Part 3 rebuild (p3-6): the new Screen-primitives Calendar view (Month grid +
// SelectedDayPanel / List + filters ChipRow). All layout, data wiring and
// interactions live in src/features/calendar/calendar-screen.tsx; this slot
// stays a thin re-export so the router/shell never needs edits.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline calendar.* steps are declared on the elements in the feature
// modules (calendar-screen / month-view / list-view / selected-day-panel /
// filter-chip-row).
const SCREEN = registerScreen({
  id: "calendar",
  title: "Calendar",
  purpose: "Browse any month, pick a day and drill into its workouts and schedule.",
  emptyPurpose: "Log workouts or schedule sessions and the grid fills up.",
});
void SCREEN;

export { default } from "@/features/calendar/calendar-screen";
