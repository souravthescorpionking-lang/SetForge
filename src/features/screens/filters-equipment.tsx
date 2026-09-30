"use client";

// Screen slot — #/filters/equipment (Part 10 §4.4 shared equipment filter)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "filters-equipment",
  title: "Equipment filters",
  purpose: "Multi-select the equipment to filter by; the selection round-trips in the URL.",
});
void SCREEN;

export { default } from "@/features/builder/filters-equipment-screen";
