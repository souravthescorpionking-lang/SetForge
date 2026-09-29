"use client";

// Screen slot — #/help
// Part 7: auto-generated Help page (every screen's registry content) plus
// static Offline / Your data / Keyboard shortcuts sections.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
const SCREEN = registerScreen({
  id: "help",
  title: "Help & Shortcuts",
  purpose: "Searchable guide to every screen, plus keyboard shortcuts and offline tips.",
});
void SCREEN;

export { default } from "@/features/help/help-screen";
