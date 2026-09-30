"use client";

// Screen slot — #/steps (Part 10 §8.3)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "steps",
  title: "Steps",
  purpose: "Daily step tracking: today's progress, manual add or set-total entries, the goal, and this week.",
});

void SCREEN;

export { default } from "@/features/steps/steps-screen";
