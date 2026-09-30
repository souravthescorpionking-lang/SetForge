"use client";

// Screen slot — #/logs (Part 9 §8 Logs)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "logs",
  title: "Logs",
  purpose: "Every logged session: search, switch to the calendar view, open or repeat any workout.",
  emptyPurpose: "Your logged sessions will stack up here month by month.",
});
void SCREEN;

export { default } from "@/features/logs/logs-screen";
