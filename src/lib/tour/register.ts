// ─────────────────────────────────────────────────────────────────────────────
// registerScreen — every route's one-line contract with the tour system
// (Part 7, LAW 2). Called ONCE at module top level of every screen file:
//
//   const SCREEN = registerScreen({
//     id: "home",
//     title: "Home",
//     purpose: "Your daily dashboard: today's session, weekly stats and logs.",
//   });
//
// The call is statically scanned by scripts/tour-gen.ts (codegen) and the
// `tour/screen-registered` ESLint rule. At runtime it is an identity function
// (no side effects) — the engine consumes the GENERATED registry JSON.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScreenRegistration } from "./types";

export function registerScreen<T extends ScreenRegistration>(reg: T): T {
  return reg;
}
