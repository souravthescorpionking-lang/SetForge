"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tour module-level API (Part 7) — callable from ANY code, React or not:
//
//   requestTourStart("settings", { force: true })   TopBarHelp "Tour this screen"
//   requestWelcomeTour()                            Settings "Replay welcome tour"
//   endActiveTour("SKIPPED")                        overlay / route-change exit
//   nextStep() / backStep()                         card footer + keyboard
//
// Cross-screen starts navigate first and park a `pending` marker in the
// store; TourProvider consumes it ~600ms after the target screen mounts.
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from "sonner";
import type { TourStatus } from "@/lib/types";
import { useApp } from "@/lib/client/store";
import { WELCOME_KEY } from "./registry";
import { resolveScreenSteps, resolveWelcomeSteps } from "./resolve";
import { screenHash } from "./screen-links";
import { useTourStore } from "./store";

function currentRouteName(): string | null {
  return useTourStore.getState().routeName;
}

/** Resolve + start a screen tour on the CURRENT DOM. Returns true if started. */
export function startScreenTourInternal(screenId: string): boolean {
  const steps = resolveScreenSteps(screenId);
  if (steps.length === 0) {
    toast.info("Nothing to tour on this screen yet");
    return false;
  }
  useTourStore.getState()._start({ screenId, steps, index: 0 });
  return true;
}

/** Resolve + start the welcome tour on the CURRENT DOM. */
export function startWelcomeTourInternal(): boolean {
  const steps = resolveWelcomeSteps();
  if (steps.length === 0) return false;
  useTourStore.getState()._start({ screenId: WELCOME_KEY, steps, index: 0 });
  return true;
}

/**
 * Start a screen tour. When the target screen is already mounted this is
 * immediate; otherwise we navigate there and queue a pending start.
 */
export function requestTourStart(screenId: string, opts?: { force?: boolean }): void {
  void opts; // force is the only mode today (replay semantics); kept for API clarity
  const st = useTourStore.getState();
  if (st.active) endActiveTour("SKIPPED"); // a tour is running — replace it
  if (currentRouteName() === screenId) {
    startScreenTourInternal(screenId);
    return;
  }
  useTourStore.setState({ pending: { screenId, welcome: false } });
  useApp.getState().navigate(screenHash(screenId));
}

/** Start (or queue) the welcome tour — navigates to #/home first. */
export function requestWelcomeTour(): void {
  const st = useTourStore.getState();
  if (st.active) endActiveTour("SKIPPED");
  if (currentRouteName() === "home") {
    if (!startWelcomeTourInternal()) toast.info("Nothing to tour yet");
    return;
  }
  useTourStore.setState({ pending: { screenId: WELCOME_KEY, welcome: true } });
  useApp.getState().navigate("#/home");
}

/**
 * End the active tour, persist its outcome, and chain the home tour after the
 * welcome tour (spec: welcome completes/skips → home tour if not yet seen).
 */
export function endActiveTour(status: TourStatus = "SKIPPED"): void {
  const ended = useTourStore.getState()._end(status);
  if (!ended) return;
  if (ended.screenId === WELCOME_KEY) {
    const now = useTourStore.getState();
    if (now.routeName === "home" && !now.seen["home"]) {
      startScreenTourInternal("home"); // queue chaining — immediately
    }
  }
}

/** Advance (Next / ArrowRight / Enter). Ends as COMPLETED on the last step. */
export function nextStep(): void {
  const st = useTourStore.getState();
  const a = st.active;
  if (!a) return;
  if (a.index >= a.steps.length - 1) {
    endActiveTour("COMPLETED");
    return;
  }
  st._goto(a.index + 1);
}

/** Go back (Back / ArrowLeft). No-op on the first step. */
export function backStep(): void {
  const st = useTourStore.getState();
  const a = st.active;
  if (a && a.index > 0) st._goto(a.index - 1);
}
