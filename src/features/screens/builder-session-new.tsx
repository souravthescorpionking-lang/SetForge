"use client";

// Screen slot — #/builder/session/new (Part 10 §4.2 draft build screen)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-session-new",
  title: "Build workout",
  purpose: "Compose a custom workout: name, level, duration and exercise series.",
});
void SCREEN;

export { default } from "@/features/builder/build-screen";
