"use client";

// Screen slot — #/progress (Part 10 §8.1)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "progress",
  title: "Progress",
  purpose: "Your weigh-in hub: weight chart with 7-day average, progress photos by pose, and full history.",
});

void SCREEN;

export { default } from "@/features/progress/progress-screen";
