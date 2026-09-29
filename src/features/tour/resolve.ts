"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Step resolution (Part 7) — runs at tour start, against the live DOM.
//
//   1. steps = screens[screenId].steps
//      + ALL component steps EXCEPT component keys nav / navpane / tourhelp
//      (shared component steps appear on every screen; the DOM check below
//      keeps only the ones that actually rendered).
//   2. Variants: same id declared multiple times (state variants) → keep the
//      FIRST whose `when` intersects the live context; none → drop.
//   3. Anchor: [data-tour-id] must exist, be visible (non-zero rect — the
//      desktop NavBar / mobile NavPane are display:none), and — for SCREEN
//      tours — live inside [data-screen-container] (NavPane is outside; the
//      NavBar renders inside Screen). The welcome tour bypasses the container
//      check on purpose: it composes navpane steps (desktop sidebar).
//   4. Hint steps (hint: true) are excluded from tours.
//   5. Sort by order asc, then id.
// ─────────────────────────────────────────────────────────────────────────────

import type { TourStep, TourWhen } from "@/lib/tour/types";
import { registry, WELCOME_KEY } from "./registry";
import { useTourStore } from "./store";

/** Component keys excluded from every screen tour (chrome, not content). */
const EXCLUDED_COMPONENTS = new Set(["nav", "navpane", "tourhelp"]);

const ALL_GATES = ["empty", "populated", "edit", "select", "guided", "resting", "desktop", "mobile"] as const;

function liveGateSet(): Set<TourWhen> {
  const ctx = useTourStore.getState().ctx;
  const set = new Set<TourWhen>(["always"]);
  for (const gate of ALL_GATES) if (ctx[gate]) set.add(gate);
  return set;
}

/** Find the live anchor element for a step id. */
export function anchorFor(stepId: string): HTMLElement | null {
  const sel = `[data-tour-id="${CSS.escape(stepId)}"]`;
  return document.querySelector<HTMLElement>(sel);
}

function screenContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-screen-container]");
}

function anchorUsable(el: HTMLElement | null, requireInContainer: boolean): el is HTMLElement {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false; // display:none (lg:hidden etc.)
  if (requireInContainer) {
    const container = screenContainer();
    if (container && !container.contains(el)) return false; // lives in the NavPane
  }
  return true;
}

/** Variant resolution: first declaration per id whose `when` intersects the context. */
function pickVariants(steps: TourStep[], gates: Set<TourWhen>): TourStep[] {
  const groups = new Map<string, TourStep[]>();
  for (const s of steps) {
    const list = groups.get(s.id);
    if (list) list.push(s);
    else groups.set(s.id, [s]);
  }
  const out: TourStep[] = [];
  for (const group of groups.values()) {
    const picked = group.find((s) => s.when.some((w) => gates.has(w)));
    if (picked && !picked.hint) out.push(picked); // hint steps never join tours
  }
  return out;
}

const byOrderThenId = (a: TourStep, b: TourStep) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Component steps of every shared component except nav/navpane/tourhelp. */
function sharedComponentSteps(): TourStep[] {
  const out: TourStep[] = [];
  for (const [key, comp] of Object.entries(registry.components)) {
    if (EXCLUDED_COMPONENTS.has(key)) continue;
    out.push(...comp.steps);
  }
  return out;
}

/** Resolve the tour steps of a screen (rules 1–5 above). */
export function resolveScreenSteps(screenId: string): TourStep[] {
  const declared = [...(registry.screens[screenId]?.steps ?? []), ...sharedComponentSteps()];
  const picked = pickVariants(declared, liveGateSet());
  const resolved = picked.filter((s) => anchorUsable(anchorFor(s.id), true));
  return resolved.sort(byOrderThenId);
}

/**
 * Welcome tour: registry.welcome.steps + navpane steps (desktop sidebar).
 * No container check — navpane lives outside the screen container by design.
 * On mobile the navpane `when: ["desktop"]` variants drop; on desktop the
 * bottom-nav anchors are display:none and drop via the visibility check.
 */
export function resolveWelcomeSteps(): TourStep[] {
  const declared = [...registry.welcome.steps, ...(registry.components.navpane?.steps ?? [])];
  const picked = pickVariants(declared, liveGateSet());
  const resolved = picked.filter((s) => anchorUsable(anchorFor(s.id), false));
  return resolved.sort(byOrderThenId);
}

/**
 * Hint candidates for a screen: every hint-declared step (screen + component,
 * any scope) whose variant matches, anchor exists, is visible and inside the
 * screen container.
 */
export function collectHintSteps(screenId: string): TourStep[] {
  const declared = [...(registry.screens[screenId]?.steps ?? [])];
  for (const comp of Object.values(registry.components)) declared.push(...comp.steps);
  const picked = pickVariants(declared, liveGateSet());
  const hints = picked.filter((s) => s.hint && anchorUsable(anchorFor(s.id), true));
  return hints.sort(byOrderThenId);
}

/**
 * ALL declarations for one screen (help page): screen steps + component steps
 * whose id prefix matches the screen id. Variants are kept (they document the
 * different states a control can be in); hint steps included.
 */
export function helpStepsFor(screenId: string): TourStep[] {
  const out: TourStep[] = [...(registry.screens[screenId]?.steps ?? [])];
  const prefix = `${screenId}.`;
  for (const comp of Object.values(registry.components)) {
    for (const s of comp.steps) if (s.id.startsWith(prefix)) out.push(s);
  }
  return out.sort(byOrderThenId);
}

/** Registry version for a screenId (or the welcome tour). */
export function versionOf(screenId: string): string {
  if (screenId === WELCOME_KEY) return registry.welcome.version;
  return registry.screens[screenId]?.version ?? "";
}
