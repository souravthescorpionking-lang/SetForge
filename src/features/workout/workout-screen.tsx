"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WorkoutScreen — #/workout (Part 8 §3.1 tab 1 · default route · Part 9 "Home").
//
//   TopBar (56)  : "Workout" · 📅 calendar action (→ #/calendar) · TopBarHelp
//   ScrollBody   : ChallengeBanner (Part 9 §10 — active, not-joined challenge;
//                  self-contained query, renders nothing otherwise)
//                  + ProgramCard (Part 9 §11 — Current program card in
//                  program-card.tsx) + 5 navigation rows (56px, rowBar, icon +
//                  label left, count muted middle-right, chevron right):
//                  Workout Logs · Programs · On Demand · Workout Library ·
//                  Workout Builder.
//
// The program-card action is the ONE primary button of the screen; the banner's
// Join is primary-TINTED and the five rows below are navigation, not competing
// actions. Data: useDashboard (today's resolved day — a PLANNED schedule entry
// already overrides the cursor server-side), workoutsApi.active() (in-progress
// session, any date), the routine detail (exercise names + day index/count),
// and one programs list query (catalog rows for the card's tagline/daysDone/
// phaseCount + cheap ROUTINE/SESSION counts for the nav rows — Logs and
// Library have no cheap count endpoint, so they show none).
//
// §6 reconcile-on-open: the workout tab is the app's landing screen, so the
// missed-schedule sweep (POST /api/schedule/reconcile-missed, idempotent)
// fires here once per page session (module-level flag) and invalidates
// ["schedule"] (+ dashboard) when it resolves — the calendar repeats the same
// sweep on its own mount.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Hammer,
  Repeat2,
  RotateCw,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useApp } from "@/lib/client/store";
import { qk, useDashboard, usePrograms } from "@/lib/client/query";
import { routinesApi, workoutsApi, scheduleReconcileApi } from "@/lib/client/api";
import { rowBar, rowTall } from "@/lib/ui/tokens";
import { errorMessage } from "@/features/routines/screen-helpers";
import { ChallengeBanner } from "./challenge-banner";
import { ProgramCard, ProgramCardSkeleton } from "./program-card";

interface NavRow {
  key: string;
  hash: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  decl: TourDecl;
}

/** §6 reconcile-on-open guard — the sweep runs once per page session (the
 *  workout tab is the landing screen; remounts after tab switches must not
 *  re-POST it). The sweep itself is idempotent server-side either way. */
let reconcileStarted = false;

const NAV_ROWS: readonly NavRow[] = [
  {
    key: "logs",
    hash: "#/logs",
    label: "Workout Logs",
    icon: ClipboardList,
    decl: { id: "workout.logs", label: "Workout Logs", help: "Every logged session, searchable and repeatable.", order: 20 },
  },
  {
    key: "programs",
    hash: "#/programs",
    label: "Programs",
    icon: Repeat2,
    decl: { id: "workout.programs", label: "Programs", help: "Multi-day routines you follow or edit.", order: 30 },
  },
  {
    key: "on-demand",
    hash: "#/on-demand",
    label: "On Demand",
    icon: Zap,
    decl: { id: "workout.onDemand", label: "On Demand", help: "Ready-made single sessions you can start now.", order: 40 },
  },
  {
    key: "library",
    hash: "#/library",
    label: "Workout Library",
    icon: BookOpen,
    decl: { id: "workout.library", label: "Workout Library", help: "Browse, adopt and manage exercises.", order: 100 },
  },
  {
    key: "builder",
    hash: "#/builder",
    label: "Workout Builder",
    icon: Hammer,
    decl: { id: "workout.builder", label: "Workout Builder", help: "Create and edit programs and sessions.", order: 60 },
  },
];

export default function WorkoutScreen() {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  const dashboardQuery = useDashboard();
  // The in-progress session (any date). Key shares the ["workout"] prefix with
  // qk.workoutByDate so useInvalidate().workout() refreshes it after Start.
  const activeSessionQuery = useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => workoutsApi.active(),
    staleTime: 15_000,
  });
  // One programs list call feeds the program card (catalog row of the card's
  // routine — tagline/daysDone/phaseCount) and both cheap row counts.
  const programsQuery = usePrograms();

  // ---------- §6 reconcile sweep (on app open; idempotent server-side) ----------
  useEffect(() => {
    if (reconcileStarted) return;
    reconcileStarted = true;
    scheduleReconcileApi
      .run()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["schedule"] });
        qc.invalidateQueries({ queryKey: qk.dashboard });
      })
      .catch(() => {
        /* fire-and-forget — offline or transient failure is non-fatal */
      });
  }, [qc]);

  const dashboard = dashboardQuery.data;
  const activeWorkout = activeSessionQuery.data?.workout ?? null;
  const inProgress =
    !!activeWorkout && activeWorkout.finishedAt == null && activeWorkout.removedAt == null;

  // Routine behind the card: the in-progress session's source wins (that is
  // what Continue resumes); otherwise the dashboard-resolved routine (the
  // server already prefers today's PLANNED schedule entry over the cursor).
  const routineId = inProgress
    ? (activeWorkout?.sourceRoutineId ?? dashboard?.today.routine?.id ?? null)
    : (dashboard?.today.routine?.id ?? dashboard?.active?.routineId ?? null);

  const routineQuery = useQuery({
    queryKey: qk.routine(routineId ?? ""),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
    staleTime: 30_000,
  });

  const counts: Record<NavRow["key"], number | undefined> = {
    logs: undefined, // no cheap total-workouts endpoint
    programs: programsQuery.data?.filter((p) => p.kind === "ROUTINE").length,
    "on-demand": programsQuery.data?.filter((p) => p.kind === "SESSION").length,
    library: undefined, // library list is a heavy full-catalog payload
    builder: undefined,
  };

  const loading = dashboardQuery.isLoading || activeSessionQuery.isLoading;
  const error = dashboardQuery.error ?? activeSessionQuery.error ?? null;
  const retry = () => {
    void dashboardQuery.refetch();
    void activeSessionQuery.refetch();
  };

  return (
    <Screen
      topBar={
        <TopBar
          title="Workout"
          actions={
            <>
              <button
                type="button"
                {...tourAttrs({ id: "workout.calendar", label: "Calendar", help: "Open the month calendar and schedule.", order: 10 })}
                aria-label="Calendar"
                onClick={() => navigate("/calendar")}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
              </button>
              <TopBarHelp />
            </>
          }
        />
      }
    >
      <ScrollBody>
        {/* Part 9 §10 — challenge banner above the program card (renders
            nothing while loading, errored, joined or dismissed). */}
        <ChallengeBanner />
        {loading ? (
          <ProgramCardSkeleton />
        ) : error ? (
          <div
            data-row
            className={`${rowTall} gap-2 rounded-lg border border-destructive/40 bg-card px-4 text-sm text-destructive`}
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 flex-none" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{errorMessage(error)}</span>
            <button
              type="button"
              {...tourAttrs({ id: "workout.retry", label: "Retry", help: "Reload today's program card data.", order: 20 })}
              aria-label="Try again"
              onClick={retry}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : dashboard ? (
          <ProgramCard dashboard={dashboard} activeWorkout={activeWorkout} routine={routineQuery.data} programs={programsQuery.data} />
        ) : null}

        <nav aria-label="Workout destinations" className="flex flex-col gap-3">
          {NAV_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <button
                key={row.key}
                type="button"
                data-row
                {...tourAttrs(row.decl)}
                onClick={() => navigate(row.hash)}
                className={`${rowBar} w-full gap-3 rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className="h-5 w-5 flex-none text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
                </span>
                {counts[row.key] != null && (
                  <span className="flex-none text-sm tabular-nums text-muted-foreground">
                    {counts[row.key]}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
              </button>
            );
          })}
        </nav>
      </ScrollBody>
    </Screen>
  );
}
