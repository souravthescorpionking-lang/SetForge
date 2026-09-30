"use client";

// Screen slot — #/days/{dayId}/replace/{reId} (Part 9 §5.2)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "day-replace",
  title: "Replace exercise",
  purpose: "Swap an exercise for a suggestion or any catalogue match; sets kept.",
});
void SCREEN;

export { default } from "@/features/day/day-replace-screen";
