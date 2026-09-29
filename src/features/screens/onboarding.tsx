"use client";

// Screen slot — #/onboarding
// Part 6 §4.16: thin re-export of the 6-step welcome wizard.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// Onboarding/auth never auto-start tours, but their controls are declared.
const SCREEN = registerScreen({
  id: "onboarding",
  title: "Welcome",
  purpose: "Six quick questions that tune units, goals and your dashboard.",
});
void SCREEN;

export { default } from "@/features/onboarding/onboarding-screen";
