"use client";

// Screen slot — #/session/arrange (Part 8)
// Reorder the active session's exercises and superset groups.

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "session-arrange",
  title: "Arrange session",
  purpose: "Reorder this session's exercises and move whole superset groups.",
});
void SCREEN;

export { default } from "@/features/today/today-arrange-screen";
