"use client";

// Screen slot — #/routines/{routineId}/exercise/{reId}
// Thin re-export of the Part 3 predefined-sets editor screen (p3-5).
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature module
// (predefinedEditor.* in src/features/routines/predefined-editor-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "predefined-editor",
  title: "Edit exercise",
  purpose: "Edit an exercise's predefined sets; blank cells copy your last workout.",
});
void SCREEN;

export { default } from "@/features/routines/predefined-editor-screen";
