"use client";

// Screen slot — #/logs/{workoutId} (Part 9 §8 Log detail)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "log-detail",
  title: "Log detail",
  purpose: "One logged session performed: set table, rest, max weight, edit history and repeat.",
});
void SCREEN;

export { default } from "@/features/logs/log-detail-screen";
