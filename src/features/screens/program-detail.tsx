"use client";

// Screen slot — #/programs/{routineId}
// Thin re-export of the Part 5 program detail screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature modules
// (programDetail.* in routine-detail-screen.tsx / header-block.tsx,
// dayActionRow.* in day-action-row.tsx, setRow.*/exerciseCard.* shared).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "program-detail",
  title: "Program",
  purpose: "Inspect a program day by day: overview, cursor, notes and inline editing.",
  emptyPurpose: "Turn on edit mode and add the first day to this program.",
});
void SCREEN;

export { default } from "@/features/routines/routine-detail-screen";
