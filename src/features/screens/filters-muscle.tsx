"use client";

// Screen slot — #/filters/muscle (Part 10 §4.4 shared muscle filter)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "filters-muscle",
  title: "Muscle filters",
  purpose: "Multi-select the target muscles; the selection round-trips in the URL.",
});
void SCREEN;

export { default } from "@/features/builder/filters-muscle-screen";
