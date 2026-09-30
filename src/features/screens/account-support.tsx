"use client";

// Screen slot — #/account/support (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-support",
  title: "Message support",
  purpose: "Send the team a message; replies land in your email.",
});
void SCREEN;

export { default } from "@/features/account/support-screen";
