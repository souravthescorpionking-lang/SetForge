"use client";

// Screen slot — #/programs
// Thin re-export of the Part 5 programs list screen (routines + sessions).
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (programs.* in src/features/routines/routines-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "programs",
  title: "Programs",
  purpose: "Browse, filter and follow your routines, or start a saved session.",
  emptyPurpose: "Create your first routine or save a session from a finished workout.",
});
void SCREEN;

export { default } from "@/features/routines/routines-screen";
