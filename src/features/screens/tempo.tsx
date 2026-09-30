"use client";

// Screen slot — #/tempo/{reId} (Part 10 §4.6 tempo picker)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "tempo",
  title: "Tempo",
  purpose: "Pick the eccentric-pause-concentric-pause timing for every set.",
});
void SCREEN;

export { default } from "@/features/builder/tempo-screen";
