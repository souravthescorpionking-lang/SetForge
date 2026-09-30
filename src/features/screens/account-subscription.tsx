"use client";

// Screen slot — #/account/subscription (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-subscription",
  title: "Subscription",
  purpose: "Your plan and billing status.",
});
void SCREEN;

export { default } from "@/features/account/subscription-screen";
