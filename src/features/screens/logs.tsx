"use client";

// Screen slot — #/logs (Part 8 §3.4 Workout Logs)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "logs",
  title: "Workout Logs",
  purpose: "Every logged session by month: search, filter, open or repeat any day.",
  emptyPurpose: "Your logged sessions will stack up here month by month.",
});
void SCREEN;

export { default } from "@/features/logs/logs-screen";
