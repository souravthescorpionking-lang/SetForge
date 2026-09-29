"use client";

// Screen slot — #/today/arrange
// Thin re-export of the Part 6 §4.10c today arrange screen.
//
// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline steps are declared on the elements in the feature modules
// (todayArrange.* in today-arrange-screen.tsx, arrangeBlocks.* in
// arrange-blocks-view.tsx).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "today-arrange",
  title: "Arrange today",
  purpose: "Reorder today's exercises and move whole superset groups.",
  emptyPurpose: "Start logging exercises first — then arrange supersets here.",
});
void SCREEN;

export { default } from "@/features/today/today-arrange-screen";
