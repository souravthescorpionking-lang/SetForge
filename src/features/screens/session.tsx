"use client";

// Screen slot — #/session (Part 8 §3.10 Logging)
// Reachable ONLY via Start/Continue — the screen redirects to #/workout when
// no session is in progress.

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "session",
  title: "Logging",
  purpose: "Log sets of your in-progress session; guided or freestyle, with rest timers.",
});
void SCREEN;

export { default } from "@/features/session/session-screen";
