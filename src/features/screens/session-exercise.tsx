"use client";

// Screen slot — #/session/exercise/{workoutExerciseId} (Part 8)
// The per-exercise focus view during a session (track / history / graph).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "session-exercise",
  title: "Exercise focus",
  purpose: "Log one exercise with last-time context, history and progress graph.",
});
void SCREEN;

export { default } from "@/features/training/training-screen";
