"use client";

// Screen slot — #/progress/log (Part 10 §8.2)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "progress-log",
  title: "Log weigh-in",
  purpose: "Log a weigh-in for any past day — week strip, weight entry and optional progress photos.",
});

void SCREEN;

export { default } from "@/features/progress/log-weigh-in-screen";
