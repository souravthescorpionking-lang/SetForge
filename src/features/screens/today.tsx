"use client";

// Screen slot — #/today
// Part 3 rebuild (p3-3): the new Screen-primitives Today view. All layout,
// data wiring and interactions live in src/features/today/today-screen.tsx;
// this slot stays a thin re-export so the router/shell never needs edits.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (today.* / setRow.* / exerciseCard.* / dateStrip.* / restBar.* / guidedBar.*).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "today",
  title: "Today",
  purpose: "Log any day's workout: sets, rest timers, guided mode and finish.",
  emptyPurpose: "Start a workout for this day or copy your last one forward.",
});
void SCREEN;

export { default } from "@/features/today/today-screen";
