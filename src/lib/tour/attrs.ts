// ─────────────────────────────────────────────────────────────────────────────
// tourAttrs / declareTour — the inline declaration helpers (Part 7).
//
// Usage (content lives ON the element — never in content files):
//
//   <button {...tourAttrs({ id: "home.start", label: "Start workout",
//             help: "Begin today's session", order: 10 })} … />
//
//   <Button tour={{ id: "home.start", label: "Start workout",
//             help: "Begin today's session", order: 10 }} … />
//
//   // shared component declaring its own steps once:
//   const STEPS: readonly TourDecl[] = [ declareTourStep... ]  // or literals
//
// `tourAttrs` and `declareTour` are the SAME function under two names:
// screens use tourAttrs on elements; shared components use declareTour to
// signal "this is a component-owned declaration" to readers + codegen.
// Both are statically scanned by scripts/tour-gen.ts (LAW 2/LAW 3).
// ─────────────────────────────────────────────────────────────────────────────

import type { TourDecl } from "./types";

export type TourAttrs = { "data-tour-id": string };

/** Spread onto any interactive element's root node. */
export function tourAttrs(tour: TourDecl): TourAttrs {
  if ("skipTour" in tour) {
    // Opt-outs render no anchor (the reason is harvested by codegen/lint).
    return {} as TourAttrs;
  }
  return { "data-tour-id": tour.id };
}

/** Semantic alias for shared component declarations (LAW 3). */
export const declareTour = tourAttrs;

/**
 * Normalize a TourDecl into the compiled TourStep shape used by the engine.
 * Pure; used by codegen (build time) — exported for tests/tools.
 */
export function toStep(tour: TourDecl, scope: "screen" | "component") {
  if ("skipTour" in tour) return null;
  return {
    id: tour.id,
    label: tour.label,
    help: tour.help,
    order: tour.order,
    when: tour.when ?? ["always"],
    hint: tour.hint ?? false,
    placement: tour.placement ?? "auto",
    shortcut: tour.shortcut,
    expandFirst: tour.expandFirst,
    scope,
  };
}
