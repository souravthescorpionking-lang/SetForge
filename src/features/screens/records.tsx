"use client";

// Screen slot — #/insights
// Part 3 p3-7 rebuild: thin re-export of the real Insights screen (Records /
// Stats / Goals tables on the layout primitives). The legacy insights-view
// pass-through was replaced wholesale.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// Route name is "insights" (this file is records.tsx for historical reasons).
// The inline insights.* steps live in insights-screen / records-tab / goals-tab.
const SCREEN = registerScreen({
  id: "insights",
  title: "Insights",
  purpose: "Personal records, rolling stats and per-exercise goals in three tabs.",
  emptyPurpose: "Log sets to grow your records, stats and goals.",
});
void SCREEN;

export { default } from "@/features/insights/insights-screen";
