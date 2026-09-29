"use client";

// Screen slot — #/profile
// Part 6 §4.16: thin re-export of the profile screen.

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// The inline profile.* steps live in profile-screen.tsx.
const SCREEN = registerScreen({
  id: "profile",
  title: "Profile",
  purpose: "Your account identity, body stats, notification switches and sign-out.",
});
void SCREEN;

export { default } from "@/features/profile/profile-screen";
