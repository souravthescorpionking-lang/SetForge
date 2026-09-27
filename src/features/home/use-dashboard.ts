"use client";

// ─────────────────────────────────────────────────────────────────────────────
// use-dashboard — the Home screen's data layer (Part 5).
//
//   useDashboard()      → TanStack query wrapper (15s staleTime) over
//                         GET /api/dashboard. The SERVER decides "today" (its
//                         date key + kind) — the client never computes it.
//   useDashboardRefresh() → keeps the payload fresh across day rollovers:
//                         • a setTimeout armed to the next LOCAL midnight
//                           (Intl timezone) that invalidates + re-arms
//                         • refetch on visibilitychange → visible
//                         • refetch on the window "online" event
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/client/query";

export { useDashboard } from "@/lib/client/query";

/** ms from now until the next local midnight (+5s so we land just past 00:00). */
export function msToNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Day-rollover + reconnect refresh for the dashboard query. */
export function useDashboardRefresh(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const refetch = () => {
      qc.invalidateQueries({ queryKey: qk.dashboard });
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const armMidnight = () => {
      timer = setTimeout(() => {
        refetch();
        armMidnight(); // re-arm for the following midnight
      }, msToNextLocalMidnight());
    };
    armMidnight();

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
    };
  }, [qc]);
}
