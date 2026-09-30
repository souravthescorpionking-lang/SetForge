"use client";

// Screen slot — #/days/{dayId}/notes/{reId} (Part 9 §5.4)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "day-notes",
  title: "Exercise notes",
  purpose: "Per-exercise coaching notes for this day; shown while logging.",
});
void SCREEN;

export { default } from "@/features/day/day-notes-screen";
