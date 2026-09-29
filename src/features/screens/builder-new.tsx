"use client";

// Screen slot — #/builder/new (Part 8 §3.8 creation wizard)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-new",
  title: "New program",
  purpose: "Generate a program from your level, days per week and goal.",
});
void SCREEN;

export { default } from "@/features/routines/program-builder-screen";
