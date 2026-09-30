"use client";

// Screen slot — #/dashboard/program (Part 10 §7.1)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "dashboard-program",
  title: "Program progress",
  purpose: "The followed program's progress: day, phase, start date, sets, volume, workouts and missed sessions.",
});

void SCREEN;

export { default } from "@/features/dashboard/program-progress-screen";
