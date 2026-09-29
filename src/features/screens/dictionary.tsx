"use client";

// Screen slot — #/dictionary
// Part 6 §4.9: thin re-export of the training-methods glossary.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline dictionary.* steps live in dictionary-screen.tsx.
const SCREEN = registerScreen({
  id: "dictionary",
  title: "Dictionary",
  purpose: "Searchable glossary of training methods and SetForge terms.",
});
void SCREEN;

export { default } from "@/features/dictionary/dictionary-screen";
