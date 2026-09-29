"use client";

// Screen slot — #/on-demand (Part 8 §3.6 On Demand)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "on-demand",
  title: "On Demand",
  purpose: "Ready-made single sessions: search, filter by time or muscle, start now.",
  emptyPurpose: "Save a session from the builder and it appears here.",
});
void SCREEN;

export { default } from "@/features/on-demand/on-demand-screen";
