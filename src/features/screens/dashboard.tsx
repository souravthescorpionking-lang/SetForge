"use client";

// Screen slot — #/dashboard (Part 8 tab 2)
// Thin re-export of the Part 8 Dashboard tab.

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "dashboard",
  title: "Dashboard",
  purpose: "Today at a glance: session card, upcoming, weekly stats, body and records.",
  emptyPurpose: "Log your first workout to light up the weekly dots and records.",
});
void SCREEN;

export { default } from "@/features/dashboard/dashboard-screen";
