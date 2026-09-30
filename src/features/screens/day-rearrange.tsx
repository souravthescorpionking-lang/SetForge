"use client";

// Screen slot — #/days/{dayId}/rearrange (Part 9 §5.1)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "day-rearrange",
  title: "Rearrange series",
  purpose: "Drag exercises within or across series; labels recompute by size.",
});
void SCREEN;

export { default } from "@/features/day/day-rearrange-screen";
