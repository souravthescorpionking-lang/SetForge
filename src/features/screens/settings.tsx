"use client";

// Screen slot — #/settings
// Part 3 p3-8: thin re-export of the rebuilt Settings screen
// (src/features/settings/settings-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
const SCREEN = registerScreen({
  id: "settings",
  title: "Settings",
  purpose: "Preferences, programs, session behaviour, display, tours, data and account controls.",
});
void SCREEN;

export { default } from "@/features/settings/settings-screen";
