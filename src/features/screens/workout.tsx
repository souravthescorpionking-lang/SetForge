"use client";

// Screen slot — #/workout (Part 8 tab 1)
// Thin re-export of the Part 8 Workout tab.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline workout.* steps live in features/workout/workout-screen.tsx.
const SCREEN = registerScreen({
  id: "workout",
  title: "Workout",
  purpose: "Start today's session; reach logs, programs, on demand, library and builder.",
  emptyPurpose: "Follow a program to get a plan, or start a freestyle session.",
});
void SCREEN;

export { default } from "@/features/workout/workout-screen";
