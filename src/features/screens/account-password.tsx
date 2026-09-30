"use client";

// Screen slot — #/account/password (Part 10 §9)

import { registerScreen } from "@/lib/tour/register";

const SCREEN = registerScreen({
  id: "account-password",
  title: "Change password",
  purpose: "Change your account password with a strength check — your session stays signed in.",
});

void SCREEN;

export { default } from "@/features/account/password-screen";
