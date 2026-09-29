"use client";

// Screen slot — #/exercise-overview/{exerciseId}
// Part 3 p3-9: thin re-export of the rebuilt Exercise Overview screen
// (src/features/exercise-overview/exercise-overview-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// NOTE: the step prefix is the camelCase "exerciseOverview." — tour-gen's id
// grammar forbids hyphens in the prefix half.
const SCREEN = registerScreen({
  id: "exercise-overview",
  title: "Exercise",
  purpose: "One exercise deep-dive: about, records, goals and full history.",
});
void SCREEN;

export { default } from "@/features/exercise-overview/exercise-overview-screen";
