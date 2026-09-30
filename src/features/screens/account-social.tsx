"use client";

// Screen slot — #/account/social (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-social",
  title: "Social accounts",
  purpose: "Linked sign-in providers for this account.",
});
void SCREEN;

export { default } from "@/features/account/social-screen";
