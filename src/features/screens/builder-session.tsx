"use client";

// Screen slot — #/builder/session/{routineId} (Part 8 §3.8 session editor)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-session",
  title: "Session editor",
  purpose: "Edit this single session's groups and predefined sets.",
});
void SCREEN;

export { default } from "@/features/builder/session-editor-screen";
