"use client";

// Screen slot — #/account/delete (Part 9 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-delete",
  title: "Delete account",
  purpose: "Permanently remove your account and data after a 30-day grace period.",
});
void SCREEN;

export { default } from "@/features/account/delete-screen";
