"use client";

// Screen slot — #/body
// Part 3 p3-7 rebuild: thin re-export of the real Body screen (primitives-only
// composition). The legacy body-view pass-through was replaced wholesale.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline body.* steps live in body-screen / body-track-tab / photo-slots /
// body-graph-tab.
const SCREEN = registerScreen({
  id: "body",
  title: "Body",
  purpose: "Track body measurements and weigh-ins, review history and chart trends.",
  emptyPurpose: "Enable metrics from the menu and log your first entries.",
});
void SCREEN;

export { default } from "@/features/body/body-screen";
