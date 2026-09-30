"use client";

// Screen slot — #/builder/{kind}/{routineId}/exercise/{reId} (Part 8 §3.8 sets editor)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "sets-editor",
  title: "Sets editor",
  purpose: "Edit one exercise's predefined sets, progression and warm-up.",
});
void SCREEN;

export { default } from "@/features/builder/sets-editor-screen";
