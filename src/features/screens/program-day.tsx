"use client";

// Screen slot — #/programs/{routineId}/day/{dayId}
// Thin re-export of the Part 6 §4.6 day detail screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature modules
// (programDay.* in program-day-screen.tsx, dayActionRow.* in
// day-action-row.tsx, setRow.*/exerciseCard.* shared).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "program-day",
  title: "Program day",
  purpose: "One program day at a glance: overview, template sets and log-to-today.",
});
void SCREEN;

export { default } from "@/features/routines/program-day-screen";
