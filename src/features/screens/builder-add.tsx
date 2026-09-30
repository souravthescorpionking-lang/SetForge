"use client";

// Screen slot — #/builder/session/{id|new}/add (Part 10 §4.3 add exercise)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-add",
  title: "Add exercise",
  purpose: "Pick exercises for this workout; 2+ picks become a superset series.",
});
void SCREEN;

export { default } from "@/features/builder/add-exercise-screen";
