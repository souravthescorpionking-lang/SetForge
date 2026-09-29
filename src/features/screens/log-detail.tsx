"use client";

// Screen slot — #/logs/{workoutId} (Part 8 §3.4 Log detail)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "log-detail",
  title: "Log detail",
  purpose: "One logged session in full: groups, sets, note, repeat and manage.",
});
void SCREEN;

export { default } from "@/features/logs/log-detail-screen";
