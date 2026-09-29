"use client";

// Screen slot — #/body/compare
// Part 6 §4.14: thin re-export of the progress-photo comparison screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// NOTE: the step prefix is the camelCase "bodyCompare." — tour-gen's id
// grammar forbids hyphens in the prefix half.
const SCREEN = registerScreen({
  id: "body-compare",
  title: "Compare",
  purpose: "Compare progress photos side by side across two dates.",
  emptyPurpose: "Add progress photos from Body → Track to start comparing.",
});
void SCREEN;

export { default } from "@/features/body/body-compare-screen";
