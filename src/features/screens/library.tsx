"use client";

// Screen slot — #/library
// Part 6 §4.1: thin re-export of the catalog + user-exercise browser.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline library.* steps live in library-screen.tsx; catalog detail
// content contributes the shared exerciseDetail.* steps.
const SCREEN = registerScreen({
  id: "library",
  title: "Library",
  purpose: "Browse the exercise catalog, filter it and adopt exercises into your account.",
});
void SCREEN;

export { default } from "@/features/library/library-screen";
