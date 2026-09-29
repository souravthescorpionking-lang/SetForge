"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tour runtime store (Part 7) — zustand.
//
// Holds the LIVE screen context (setTourContext), the active tour, and the
// seen maps (screen tours + hints). Everything here is readable/writable from
// NON-React code via `useTourStore.getState()` — the module-level API lives in
// ./actions.ts (requestTourStart / requestWelcomeTour / endActiveTour …).
//
// Default context = { desktop | mobile } only; screens call setTourContext
// (empty/populated/edit/select/guided/resting) as they mount (a follow-up
// wires Today; the gates simply don't match until then).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { TourStep } from "@/lib/tour/types";
import type { TourStatus, ToursStateResponseDTO } from "@/lib/types";
import { registry, WELCOME_KEY } from "./registry";
import {
  markHintRemote,
  putStateRemote,
  readMirrorFor,
  writeMirror,
  type SeenRecord,
} from "./persist";

/** Live context gates (LAW: `when` arrays intersect this). */
export type TourContextFlags = {
  empty: boolean;
  populated: boolean;
  edit: boolean;
  select: boolean;
  guided: boolean;
  resting: boolean;
  desktop: boolean;
  mobile: boolean;
};

export type ActiveTour = {
  screenId: string; // route name, or WELCOME_KEY
  steps: TourStep[];
  index: number;
};

type TourStore = {
  ownerId: string | null;
  ctx: TourContextFlags;
  active: ActiveTour | null;
  paused: boolean;
  seen: Record<string, SeenRecord>;
  hintsSeen: Record<string, string>;
  /** True once the mirror/server state has been merged (auto-start gate). */
  loaded: boolean;
  /** Current route name, synced by TourProvider (module-level access). */
  routeName: string | null;
  /** Queued start waiting for its screen to mount (cross-screen replay). */
  pending: { screenId: string; welcome: boolean } | null;

  setTourContext: (partial: Partial<TourContextFlags>) => void;
  _setRoute: (name: string) => void;
  /** Session change → full reset (+ instant boot from the mirror). */
  _resetAll: (userId: string | null) => void;
  /** Merge server state with the local mirror (retry offline writes). */
  hydrate: (data: ToursStateResponseDTO, userId: string) => void;
  _start: (tour: ActiveTour) => void;
  _goto: (index: number) => void;
  _setPaused: (paused: boolean) => void;
  /** Record the outcome + persist; returns the ended tour (for chaining). */
  _end: (status: TourStatus) => ActiveTour | null;
  _markHint: (hintId: string) => void;
  /** Clear seen state locally (after a server-side reset). */
  _resetSeen: (scope: "all" | { screenId: string }) => void;
};

function initialViewportCtx(): Pick<TourContextFlags, "desktop" | "mobile"> {
  if (typeof window === "undefined") return { desktop: false, mobile: true };
  const desktop = window.matchMedia("(min-width: 1024px)").matches;
  return { desktop, mobile: !desktop };
}

/** Viewport gates track resize (matchMedia listener in TourProvider). */
const baseCtx = (): TourContextFlags => ({
  empty: false,
  populated: false,
  edit: false,
  select: false,
  guided: false,
  resting: false,
  ...initialViewportCtx(),
});

export const useTourStore = create<TourStore>((set, get) => ({
  ownerId: null,
  ctx: baseCtx(),
  active: null,
  paused: false,
  seen: {},
  hintsSeen: {},
  loaded: false,
  routeName: null,
  pending: null,

  setTourContext: (partial) => set({ ctx: { ...get().ctx, ...partial } }),

  _setRoute: (name) => set({ routeName: name }),

  _resetAll: (userId) => {
    // Instant boot: seed from this user's mirror (offline fallback included).
    const seeded = userId ? readMirrorFor(userId) : null;
    set({
      ownerId: userId,
      active: null,
      paused: false,
      pending: null,
      seen: seeded?.states ?? {},
      hintsSeen: seeded?.hints ?? {},
      // No mirror → wait for the server merge before any auto-start.
      loaded: Boolean(seeded),
      ctx: { ...get().ctx, empty: false, populated: false, edit: false, select: false, guided: false, resting: false },
    });
  },

  hydrate: (data, userId) => {
    const serverStates: Record<string, SeenRecord> = {};
    for (const s of data.states) {
      serverStates[s.screenId] = {
        version: s.version,
        status: s.status,
        stepReached: s.stepReached,
        updatedAt: s.updatedAt,
      };
    }
    const serverHints: Record<string, string> = {};
    for (const h of data.hints) serverHints[h.hintId] = h.seenAt;

    let states = serverStates;
    let hints = serverHints;
    const local = readMirrorFor(userId);
    if (local) {
      // Offline write retry: mirror records the server lacks or differs on.
      for (const [id, rec] of Object.entries(local.states)) {
        const srv = serverStates[id];
        if (!srv || srv.version !== rec.version || srv.status !== rec.status || srv.stepReached !== rec.stepReached) {
          putStateRemote(id, rec);
        }
      }
      for (const id of Object.keys(local.hints)) {
        if (!serverHints[id]) markHintRemote(id);
      }
      states = { ...serverStates, ...local.states };
      hints = { ...serverHints, ...local.hints };
    }
    // In-memory records (written since load) survive refetches.
    states = { ...states, ...get().seen };
    hints = { ...hints, ...get().hintsSeen };
    set({ ownerId: userId, seen: states, hintsSeen: hints, loaded: true });
    writeMirror(states, hints);
  },

  _start: (tour) => set({ active: { ...tour }, paused: false, pending: null }),

  _goto: (index) => {
    const a = get().active;
    if (!a) return;
    set({ active: { ...a, index } });
  },

  _setPaused: (paused) => {
    if (!get().active) return;
    set({ paused });
  },

  _end: (status) => {
    const a = get().active;
    if (!a) return null;
    const version =
      a.screenId === WELCOME_KEY ? registry.welcome.version : (registry.screens[a.screenId]?.version ?? "");
    const rec: SeenRecord = {
      version,
      status,
      stepReached: status === "COMPLETED" ? a.steps.length : a.index,
      updatedAt: new Date().toISOString(),
    };
    const seen = { ...get().seen, [a.screenId]: rec };
    set({ active: null, paused: false, seen });
    writeMirror(seen, get().hintsSeen);
    putStateRemote(a.screenId, rec);
    return a;
  },

  _markHint: (hintId) => {
    const hintsSeen = { ...get().hintsSeen, [hintId]: new Date().toISOString() };
    set({ hintsSeen });
    writeMirror(get().seen, hintsSeen);
    markHintRemote(hintId);
  },

  _resetSeen: (scope) => {
    let seen = get().seen;
    let hintsSeen = get().hintsSeen;
    if (scope === "all") {
      seen = {};
      hintsSeen = {};
    } else {
      const next = { ...seen };
      delete next[scope.screenId];
      seen = next;
    }
    set({ seen, hintsSeen });
    writeMirror(seen, hintsSeen);
  },
}));

/** Context setter usable from any screen (module-level, non-React friendly). */
export function setTourContext(partial: Partial<TourContextFlags>): void {
  useTourStore.getState().setTourContext(partial);
}
