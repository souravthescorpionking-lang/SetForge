"use client";

// Screen slot — #/account/terms (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-terms",
  title: "Terms of service",
  purpose: "The agreement between you and SetForge.",
});
void SCREEN;

export { default } from "@/features/account/terms-screen";
