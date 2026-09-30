"use client";

// Screen slot — #/on-demand/filters (Part 9 §7)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "on-demand-filters",
  title: "On demand filters",
  purpose: "Filter on-demand sessions by intensity, target area, duration and equipment.",
});
void SCREEN;

export { default } from "@/features/on-demand/on-demand-filters-screen";
