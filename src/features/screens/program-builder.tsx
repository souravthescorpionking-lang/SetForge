"use client";

// Screen slot — #/programs/new/builder
// Thin re-export of the Part 6 §4.7 program builder screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (programBuilder.* in src/features/routines/program-builder-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "program-builder",
  title: "Program builder",
  purpose: "Generate a phased program from a weekly template in five steps.",
});
void SCREEN;

export { default } from "@/features/routines/program-builder-screen";
