"use client";

// Screen slot — #/builder/session/{routineId} (Part 10 §4.2 evolved: the Build
// workout screen handles BOTH the draft (#/builder/session/new) and this edit
// route for persisted custom workouts; the Part 8 session-editor-screen is
// superseded, kept compiled-but-unrouted per the migration precedent).

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-session",
  title: "Build workout",
  purpose: "Edit this workout's name, level, duration and exercise series.",
});
void SCREEN;

export { default } from "@/features/builder/build-screen";
