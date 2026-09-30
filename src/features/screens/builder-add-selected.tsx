"use client";

// Screen slot — #/builder/session/{id|new}/add/selected (Part 10 §4.3)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-add-selected",
  title: "Selected exercises",
  purpose: "Review, reorder or remove the exercises picked for the new series.",
});
void SCREEN;

export { default } from "@/features/builder/add-selected-screen";
