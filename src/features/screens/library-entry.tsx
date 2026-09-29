"use client";

// Screen slot — #/library/{catalogKey}
// Part 6 §4.2: thin re-export of the catalog entry detail screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// NOTE: the step prefix is the camelCase "libraryEntry." — tour-gen's id
// grammar forbids hyphens in the prefix half.
const SCREEN = registerScreen({
  id: "library-entry",
  title: "Exercise",
  purpose: "Catalog detail for one exercise: media, setup, muscles and adoption.",
});
void SCREEN;

export { default } from "@/features/library/library-entry-screen";
