"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TourProvider (Part 7) — mounted by AppShell INSIDE the authenticated branch,
// wrapping the shell content. Owns:
//
//   • TanStack query ["tours","state"] → toursApi.getState(), hydrated into
//     the tour store (with the localStorage mirror merge — see ./persist.ts).
//   • Auto-start rules, evaluated ~600ms after each route change and only
//     when: state loaded, settings loaded, no active tour, no modal open.
//       - NEVER on auth / onboarding / dev.
//       - ?tour=1 on the query → force replay, then the param is stripped.
//       - Welcome tour on #/home (onboarded, showTours, version unseen).
//       - Screen tour when unseen (or version bumped + replayToursOnUpdate).
//   • Route change while touring → end with status SKIPPED + stepReached.
//   • The overlay + hint surfaces (portaled; LAW 4/5: only fixed elements).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toursApi } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import type { UserProfileDTO } from "@/lib/types";
import type { Route } from "@/features/shell/router";
import { replaceHash, useHashRoute } from "@/features/shell/router";
import { NO_TOUR_SCREENS, registry, WELCOME_KEY } from "./registry";
import {
  startScreenTourInternal,
  startWelcomeTourInternal,
  endActiveTour,
} from "./actions";
import { useTourStore } from "./store";
import { TourOverlay } from "./tour-overlay";
import { HintManager } from "./hints";

function stripTourParam(route: Route): void {
  const q = new URLSearchParams(route.query);
  q.delete("tour");
  const path = (route.hash.split("?")[0] ?? "").replace(/^#/, "#");
  const qs = q.toString();
  replaceHash(qs ? `${path}?${qs}` : path);
}

function evaluateAutoStart(route: Route, onboarded: boolean): void {
  const st = useTourStore.getState();
  if (st.active || st.paused) return;
  if (NO_TOUR_SCREENS.has(route.name)) return;
  // A modal/sheet is open (Radix dialog or popper) — never start on top of it.
  if (document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return;

  // 1) ?tour=1 → force replay (ignores seen/version/showTours), then strip.
  if (route.query.get("tour") === "1") {
    stripTourParam(route);
    startScreenTourInternal(route.name);
    return;
  }

  // 2) Pending start queued from another screen (Settings replay rows,
  //    TopBarHelp cross-screen starts, welcome replay).
  const pending = st.pending;
  if (pending) {
    if (pending.welcome) {
      if (route.name !== "workout") return; // navigation still in flight
      useTourStore.setState({ pending: null });
      startWelcomeTourInternal();
      return;
    }
    if (pending.screenId !== route.name) return; // navigation still in flight
    useTourStore.setState({ pending: null });
    startScreenTourInternal(pending.screenId);
    return;
  }

  const settings = useApp.getState().settings;
  if (!settings?.showTours) return;

  // 3) Welcome tour on #/home (onboarded + version unseen).
  if (route.name === "workout" && onboarded && st.seen[WELCOME_KEY]?.version !== registry.welcome.version) {
    startWelcomeTourInternal();
    return;
  }

  // 4) Screen tour: first visit always; version bump only with replayToursOnUpdate.
  const entry = registry.screens[route.name];
  if (!entry) return;
  const seen = st.seen[route.name];
  if (seen) {
    if (seen.version === entry.version) return; // up to date
    if (!settings.replayToursOnUpdate) return; // content changed, no replay
  }
  startScreenTourInternal(route.name);
}

export function TourProvider({ children, profile }: { children: ReactNode; profile?: UserProfileDTO | null }) {
  const session = useApp((s) => s.session);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const loaded = useTourStore((s) => s.loaded);
  const ownerId = useTourStore((s) => s.ownerId);

  // Server state (the query refetches after reset via invalidateQueries).
  const { data } = useQuery({
    queryKey: ["tours", "state"],
    queryFn: () => toursApi.getState(),
    staleTime: 30_000,
    retry: 1,
  });

  // Session change (login/logout/switch) → full store reset + mirror boot.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (uid !== ownerId) useTourStore.getState()._resetAll(uid);
  }, [uid, ownerId]);

  // Merge server data into the store (retries offline mirror writes).
  useEffect(() => {
    if (data && uid) useTourStore.getState().hydrate(data, uid);
  }, [data, uid]);

  // Keep the viewport gates (desktop/mobile) live across breakpoint changes.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      useTourStore.getState().setTourContext({ desktop: e.matches, mobile: !e.matches });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Route sync: remember the current screen; touring + route change → SKIPPED.
  useEffect(() => {
    useTourStore.getState()._setRoute(route.name);
    if (useTourStore.getState().active) endActiveTour("SKIPPED");
  }, [route.name]);

  // Auto-start evaluation (~600ms after route change / readiness).
  const ready = Boolean(settings) && loaded;
  const onboarded = profile?.onboardingCompletedAt != null;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => evaluateAutoStart(route, onboarded), 600);
    return () => clearTimeout(t);
  }, [route.hash, ready, onboarded, uid]);

  return (
    <>
      {children}
      <TourOverlay />
      <HintManager />
    </>
  );
}
