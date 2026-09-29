"use client";

// Screen slot — #/today/{exerciseId}
// Thin re-export of the Part 3 training screen (p3-4): Track / History / Graph
// tabs on the layout primitives + the ONE ExerciseCard.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline training.* steps are declared on the elements in the feature
// module (src/features/training/training-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "training",
  title: "Training",
  purpose: "Focus on one exercise: log today's sets, review history and chart progress.",
});
void SCREEN;

export { default } from "@/features/training/training-screen";
