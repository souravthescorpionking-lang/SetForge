"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DashboardScreen — #/dashboard (Part 8 §3.2, tab 2; top half rebuilt Part 10 §7).
//
//   TopBar (56)   "Dashboard" | 📅 (→ #/calendar) | ? TopBarHelp
//   ScrollBody    ProgramProgressCard (§7: R1 label · R2 name + daysDone pill ·
//                 4px progress bar + phase chips · CTA row; tap → #/dashboard/program)
//                 Today (§7: header + Calendar › · 56px rows per today
//                 ScheduleEntry · empty → #/schedule/pick)
//                 Stats (§7: Weight tile + Steps tile → #/progress · #/steps)
//                 Upcoming                          32  (Part 5 content — kept)
//                 Fri 27 · Pull day          PPL    48 ×4 (tap → #/calendar?date=…)
//                 This week                         32
//                 3 workouts · 34 sets · 6,200 kg    48
//                 ● ● ◉ ○ · · ·                     32  Mon–Sun activity dots
//                 Body                              32
//                 82.4 kg ▼0.6 · 7-day avg     >    48  (7-day average primary, §6.6)
//                 Records this month                32
//                 Bench 100×5 · Deadlift 160×3 >    48
//   BottomBar (56) [ Start today's session ]         primary — same logic as
//                 the card CTA: continue → start-day → on-demand → pick
//   NavBar renders automatically (Workout · Dashboard · More).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Loader2, Play, RotateCw, TriangleAlert } from "lucide-react";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useDashboard, useInvalidate, useOnline, usePrograms } from "@/lib/client/query";
import { programsApi, routinesApi, workoutsApi } from "@/lib/client/api";
import { parseDayKey, todayKey } from "@/lib/client/format";
import { rowTall } from "@/lib/ui/tokens";
import { errorMessage } from "@/features/routines/screen-helpers";
import { cn } from "@/lib/utils";
import type { DashboardUpcomingDayDTO } from "@/lib/types";
import { ProgramProgressCard, ProgramProgressCardSkeleton } from "./program-progress-card";
import { TodaySection } from "./today-section";
import { StatsTiles } from "./stats-tiles";
import { WeekDots } from "./week-dots";
import { BodyRow } from "./body-row";
import { RecordsMonthRow } from "./records-month-row";

/** 32px section header — muted, single-line, NOT a data-row. */
function SectionHeader({ title }: { title: string }) {
  return (
    <p className="flex h-8 flex-none items-center overflow-hidden whitespace-nowrap px-1 text-xs font-medium text-muted-foreground">
      <span className="truncate">{title}</span>
    </p>
  );
}

/** "Thu 26 Sep" — weekday · day · month, locale-order independent (UTC). */
function longDateLabel(dayKey: string): string {
  const d = parseDayKey(dayKey);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

/** "Fri 27" — weekday · day (UTC). */
function shortDateLabel(dayKey: string): string {
  const d = parseDayKey(dayKey);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()}`;
}

// ── Upcoming ─────────────────────────────────────────────────────────────────

function upcomingLabel(day: DashboardUpcomingDayDTO): string {
  if (day.kind === "SCHEDULED") return day.entry?.dayName ?? day.label ?? "Scheduled";
  return day.label ?? (day.kind === "REST" ? "Rest" : "Workout");
}

function upcomingProgram(day: DashboardUpcomingDayDTO, activeName: string | null): string | null {
  // SCHEDULED rows carry their own routine; cursor projections belong to the
  // followed program.
  if (day.kind === "SCHEDULED") return day.entry?.routineName ?? null;
  return activeName;
}

function UpcomingRow({ day, program }: { day: DashboardUpcomingDayDTO; program: string | null }) {
  const navigate = useApp((s) => s.navigate);
  const dateLabel = shortDateLabel(day.date);
  const label = upcomingLabel(day);
  return (
    <button
      type="button"
      data-row
      {...tourAttrs({
        id: "dashboard.upcomingRow",
        label: "Upcoming day",
        help: "A scheduled or projected day. Tap to open it in the calendar.",
        order: 30,
      })}
      onClick={() => navigate(`/calendar?date=${day.date}`)}
      aria-label={`${longDateLabel(day.date)} — ${label}${program ? ` (${program})` : ""}`}
      className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex-none text-sm tabular-nums text-muted-foreground">{dateLabel}</span>
      <span className="flex-none text-muted-foreground" aria-hidden>
        ·
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-medium",
          day.kind === "REST" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {program ? (
        <span className="max-w-[40%] flex-none truncate text-xs text-muted-foreground">{program}</span>
      ) : null}
    </button>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const dashboardQuery = useDashboard();
  const dash = dashboardQuery.data;
  const [starting, setStarting] = useState(false);

  // The in-progress session (any date) — same query the Workout tab uses; the
  // ["workout"] key prefix means useInvalidate().workout() refreshes it.
  const activeSessionQuery = useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => workoutsApi.active(),
    staleTime: 15_000,
  });
  const activeWorkout = activeSessionQuery.data?.workout ?? null;
  const inProgress =
    !!activeWorkout && activeWorkout.finishedAt == null && activeWorkout.removedAt == null;

  // Routine behind the card (exercise names + day index/count for ProgramCard).
  const routineId = inProgress
    ? (activeWorkout?.sourceRoutineId ?? dash?.today.routine?.id ?? null)
    : (dash?.today.routine?.id ?? dash?.active?.routineId ?? null);
  const routineQuery = useQuery({
    queryKey: qk.routine(routineId ?? ""),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
    staleTime: 30_000,
  });
  // Catalog rows for the shared ProgramCard's §11 header (tagline/daysDone/
  // phaseCount) — same cached ["programs"] query the Workout tab uses.
  const programsQuery = usePrograms();

  const weekStart = settings?.weekStart === 0 ? 0 : 1;
  // The server-resolved today date (user timezone) — client fallback while loading.
  const today = dash?.today.date ?? todayKey();
  const monthKey = today.slice(0, 7);

  // ---------- BottomBar primary — same logic as the Today card primary ----------
  const startToday = useCallback(() => {
    if (!dash) return;
    const { today: day, active: activeRoutine } = dash;
    // 1. active session (any date) → continue it
    if (inProgress) {
      navigate("/session");
      return;
    }
    // 2. rest day → pick a ready session instead
    if (day.kind === "REST" || day.day?.dayType === "REST") {
      navigate("/on-demand");
      return;
    }
    // 3. following a program (or a finished session earlier today) → start day
    const rid = day.routine?.id ?? activeRoutine?.routineId ?? null;
    if (day.kind === "WORKOUT" && rid) {
      if (!online) {
        toast.info("Starting a workout needs a connection");
        return;
      }
      const dayId = day.day?.id ?? dash.today.scheduled?.dayId ?? activeRoutine?.dayId ?? undefined;
      setStarting(true);
      programsApi
        .startDay(rid, { ...(dayId ? { dayId } : {}), date: day.date })
        .then(() => {
          invalidate.workout();
          invalidate.dashboard();
          invalidate.schedule();
          navigate("/session");
        })
        .catch((e: unknown) => toast.error(errorMessage(e)))
        .finally(() => setStarting(false));
      return;
    }
    // 4. nothing followed → pick a program
    navigate("/programs");
  }, [dash, inProgress, navigate, online, invalidate]);

  // ---------- upcoming ----------
  const upcoming = useMemo(() => dash?.upcoming.slice(0, 4) ?? [], [dash]);
  const activeName = dash?.active?.routineName ?? null;

  // ---------- this week ----------
  const imperial = settings?.unitSystem === "imperial";
  const statsText = dash
    ? `${dash.stats.weekWorkouts} ${dash.stats.weekWorkouts === 1 ? "workout" : "workouts"} · ${dash.stats.weekSets} ${dash.stats.weekSets === 1 ? "set" : "sets"} · ${Math.round(imperial ? dash.stats.weekVolume * 2.20462 : dash.stats.weekVolume).toLocaleString()} ${imperial ? "lb" : "kg"}`
    : null;

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
          title="Dashboard"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none px-0"
                aria-label="Calendar"
                tour={{
                  id: "dashboard.calendar",
                  label: "Calendar",
                  help: "Open the month calendar.",
                  order: 10,
                }}
                onClick={() => navigate("/calendar")}
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 w-full gap-2 whitespace-nowrap text-base font-bold"
            disabled={loading || starting}
            tour={{
              id: "dashboard.start",
              label: "Start today's session",
              help: "Continue or start today's session; picks a program when you have none.",
              order: 60,
            }}
            onClick={startToday}
          >
            {starting ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Play className="h-5 w-5" aria-hidden />
            )}
            Start today&apos;s session
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {/* §7.1 — Program progress card (tap → #/dashboard/program) */}
        {loading ? (
          <ProgramProgressCardSkeleton />
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
              {...tourAttrs({ id: "dashboard.retry", label: "Retry", help: "Reload the dashboard data.", order: 20 })}
              aria-label="Try again"
              onClick={retry}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : dash ? (
          <ProgramProgressCard dashboard={dash} activeWorkout={activeWorkout} routine={routineQuery.data} />
        ) : null}

        {/* §7.2 — Today: today's scheduled sessions */}
        <TodaySection today={today} />

        {/* §7.3 — Stats tiles (Weight → #/progress · Steps → #/steps) */}
        <StatsTiles today={today} />

        {/* Upcoming */}
        <SectionHeader title="Upcoming" />
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" aria-busy="true" aria-hidden />
          ))
        ) : upcoming.length > 0 ? (
          upcoming.map((day) => <UpcomingRow key={day.date} day={day} program={upcomingProgram(day, activeName)} />)
        ) : (
          <div
            data-row
            className="flex h-12 w-full items-center overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm text-muted-foreground"
          >
            Follow a program to see upcoming days
          </div>
        )}

        {/* This week */}
        <SectionHeader title="This week" />
        <div
          data-row
          aria-label={statsText ? `This week: ${statsText}` : "This week"}
          className="flex h-12 w-full items-center overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4"
        >
          {statsText ? (
            <span className="min-w-0 flex-1 truncate text-sm tabular-nums">{statsText}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">…</span>
          )}
        </div>
        <WeekDots today={today} weekStart={weekStart} ready={!loading && !!dash} />

        {/* Body */}
        <SectionHeader title="Body" />
        <BodyRow />

        {/* Records this month */}
        <SectionHeader title="Records this month" />
        <RecordsMonthRow monthKey={monthKey} />
      </ScrollBody>
    </Screen>
  );
}
