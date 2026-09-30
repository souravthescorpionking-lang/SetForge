"use client";

// Screen slot — #/days/{dayId} (Part 9 §5 Day Overview)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "day",
  title: "Day overview",
  purpose: "One training day at a glance: muscle chips, series cards and actions.",
});
void SCREEN;

export { default } from "@/features/day/day-screen";
