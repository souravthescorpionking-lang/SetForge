"use client";

// Screen slot — #/home
// Thin re-export of the Part 5 home dashboard screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline home.* steps are declared on the elements in the feature
// modules (home-screen / today-card / upcoming-strip / stats-row /
// today-workout-section).
const SCREEN = registerScreen({
  id: "home",
  title: "Home",
  purpose: "Your dashboard: today's session, weekly stats and the latest logged workout.",
  emptyPurpose: "Follow a program to get a daily training pointer here.",
});
void SCREEN;

export { default } from "@/features/home/home-screen";
