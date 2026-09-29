"use client";

// Screen slot — #/more
// Thin re-export of the Part 5 "more" index screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline more.* steps live in more-screen.tsx (one per destination row).
const SCREEN = registerScreen({
  id: "more",
  title: "More",
  purpose: "Index of secondary destinations: insights, history, library, tools and settings.",
});
void SCREEN;

export { default } from "@/features/more/more-screen";
