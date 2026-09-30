"use client";

// Screen slot — #/session/settings (Part 10 §3.5)
// Reachable from #/session ⚙ while a session is in progress; the screen
// redirects to #/session when no session is active.

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "session-settings",
  title: "Session settings",
  purpose: "Live-session behaviour: auto-advance, countdown sounds, tempo row, video speed, and the workout exit.",
});
void SCREEN;

export { default } from "@/features/session/session-settings-screen";
