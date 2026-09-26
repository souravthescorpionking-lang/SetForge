// Global client state: session, settings, hash routing.
"use client";

import { create } from "zustand";
import type { SessionDTO, SettingsDTO } from "@/lib/types";
import { settingsApi } from "./api";
import { toast } from "sonner";

export type RouteView =
  | "today"
  | "history"
  | "exercises"
  | "exercise-overview"
  | "insights"
  | "calendar"
  | "routines"
  | "body"
  | "tools"
  | "settings";

export type AppState = {
  session: SessionDTO | null;
  settings: SettingsDTO | null;
  route: { view: RouteView; param?: string; query: URLSearchParams };
  hydrated: boolean;
  setSession: (s: SessionDTO | null) => void;
  updateSettings: (patch: Partial<SettingsDTO>) => Promise<void>;
  setRouteFromHash: () => void;
  navigate: (path: string) => void;
};

const DEFAULT_VIEW: RouteView = "today";

export function parseHash(hash: string): { view: RouteView; param?: string; query: URLSearchParams } {
  const clean = hash.replace(/^#\/?/, "");
  if (!clean) return { view: DEFAULT_VIEW, query: new URLSearchParams() };
  const [pathPart, queryPart] = clean.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const view = (segments[0] as RouteView) ?? DEFAULT_VIEW;
  const param = segments[1];
  return { view, param, query: new URLSearchParams(queryPart ?? "") };
}

export const useApp = create<AppState>((set, get) => ({
  session: null,
  settings: null,
  route: { view: DEFAULT_VIEW, query: new URLSearchParams() },
  hydrated: false,

  setSession: (session) => {
    set({ session, settings: session?.settings ?? null, hydrated: true });
  },

  updateSettings: async (patch) => {
    const current = get().settings;
    if (current) set({ settings: { ...current, ...patch } }); // optimistic
    try {
      const updated = await settingsApi.update(patch);
      set({ settings: updated });
      const session = get().session;
      if (session) set({ session: { ...session, settings: updated } });
    } catch (e) {
      if (current) set({ settings: current }); // rollback
      toast.error("Could not save settings");
      throw e;
    }
  },

  setRouteFromHash: () => {
    const route = parseHash(window.location.hash);
    set({ route });
  },

  navigate: (path) => {
    const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
    if (window.location.hash === target) {
      get().setRouteFromHash();
    } else {
      window.location.hash = target;
    }
  },
}));
