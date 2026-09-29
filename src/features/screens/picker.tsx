"use client";

// Screen slot — #/exercises
// Thin re-export of the Part 3 exercise picker screen (p3-4): full-screen
// picker with chip filters, inline create/edit, and pick/replace/multi modes.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline exercises.* steps are declared on the elements in the feature
// module (src/features/picker/picker-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "exercises",
  title: "Exercises",
  purpose: "Browse, search and filter the library, then add exercises to your day.",
  emptyPurpose: "Create your first exercise or widen the filters.",
});
void SCREEN;

export { default } from "@/features/picker/picker-screen";
