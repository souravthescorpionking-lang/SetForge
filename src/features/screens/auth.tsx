"use client";

// Screen slot — #/auth
// Part 3 p3-8: thin re-export of the rebuilt Auth screen
// (src/features/auth/auth-screen.tsx). Rendered by the shell whenever the
// session is null (hash is forced to #/auth).

import { registerScreen } from "@/lib/tour/register";

// Part 7 LAW 2 — the screen's tour/help contract (harvested by tour:gen).
// Full-screen layout without a TopBar — no TopBarHelp here; the auth.* steps
// are declared on the form controls in auth-screen.tsx (never auto-start).
const SCREEN = registerScreen({
  id: "auth",
  title: "Sign in",
  purpose: "Sign in to your SetForge account or create a new one.",
});
void SCREEN;

export { default } from "@/features/auth/auth-screen";
