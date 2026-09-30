"use client";

// Screen slot — #/account/privacy (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-privacy",
  title: "Privacy policy",
  purpose: "How SetForge stores and protects your training data.",
});
void SCREEN;

export { default } from "@/features/account/privacy-screen";
