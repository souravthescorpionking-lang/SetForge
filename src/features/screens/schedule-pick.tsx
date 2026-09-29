"use client";

// Screen slot — #/schedule/pick?date=YYYY-MM-DD
// Thin re-export of the Part 5 schedule picker screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (schedulePick.* in src/features/schedule/schedule-pick-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "schedule-pick",
  title: "Schedule workout",
  purpose: "Pick the routine day or session to place on a chosen date.",
  emptyPurpose: "No routines yet — create one under Programs first.",
});
void SCREEN;

export { default } from "@/features/schedule/schedule-pick-screen";
