"use client";

// Screen slot — #/builder/program/{routineId} (Part 8 §3.8 program editor)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "builder-program",
  title: "Program editor",
  purpose: "Edit days, groups and predefined sets; drag to reorder.",
});
void SCREEN;

export { default } from "@/features/builder/program-editor-screen";
