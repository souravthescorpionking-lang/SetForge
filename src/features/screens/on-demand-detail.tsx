"use client";

// Screen slot — #/on-demand/{id} (Part 8 §3.6 On Demand session detail)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "on-demand-detail",
  title: "Session detail",
  purpose: "One on-demand session in full: groups, sets, start now or schedule it.",
});
void SCREEN;

export { default } from "@/features/on-demand/on-demand-detail-screen";
