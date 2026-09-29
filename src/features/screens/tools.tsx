"use client";

// Screen slot — #/tools
// Part 3 p3-8: thin re-export of the rebuilt Tools screen
// (src/features/tools/tools-screen.tsx).

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline tools.* steps live in tools-screen / tool-bits / interval-tool.
const SCREEN = registerScreen({
  id: "tools",
  title: "Tools",
  purpose: "Four offline calculators: 1RM, plates, set percentages and an interval timer.",
});
void SCREEN;

export { default } from "@/features/tools/tools-screen";
