"use client";

// Screen slot — #/history
// Part 3 rebuild (p3-6): the workout-history list on the Part 3 system
// (DateGroup language + the ONE ExerciseCard). All layout, data wiring and
// interactions live in src/features/history/history-screen.tsx; this slot
// stays a thin re-export so the router/shell never needs edits.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline history.* steps live in history-screen.tsx / workout-block.tsx;
// ExerciseCard contributes its shared exerciseCard.* steps.
const SCREEN = registerScreen({
  id: "history",
  title: "History",
  purpose: "Scroll every logged workout by month and expand any day's sets.",
  emptyPurpose: "Your logged workouts will stack up here month by month.",
});
void SCREEN;

export { default } from "@/features/history/history-screen";
