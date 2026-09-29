"use client";

// Screen slot — #/routines/{routineId}/log/{dayId}
// Thin re-export of the Part 3 log-day screen (p3-5).
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (logDay.* in src/features/routines/log-day-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "log-day",
  title: "Log day",
  purpose: "Preview a program day, tweak the sets, then log them to today.",
  emptyPurpose: "This day has no exercises yet — edit the routine first.",
});
void SCREEN;

export { default } from "@/features/routines/log-day-screen";
