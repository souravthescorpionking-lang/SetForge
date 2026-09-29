"use client";

// Screen slot — #/builder (Part 8 §3.8 Workout Builder hub)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder",
  title: "Builder",
  purpose: "Create programs and sessions, or edit the ones you own.",
});
void SCREEN;

export { default } from "@/features/builder/builder-screen";
