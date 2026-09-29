"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodayCard — section A of the Home dashboard (Part 5).
//
// Three FIXED-height states (no CLS between states):
//   A (WORKOUT day, ~168px): 4px source bar + day title + ⋮ (Skip day ·
//     Jump to day… · Schedule instead · Unfollow program) + up to 3 exercise
//     names (13px, single-line ellipsis) + "12 sets · ~45 min" meta + a 48px
//     primary button that morphs Start → Continue → Finished ✓.
//   B (REST day, ~120px): day name + "Rest day · advances at midnight" +
//     two equal buttons [Mark rest done | Train anyway].
//   C (no program, ~120px): "No program" + [Choose program].
// A PLANNED session entry for today renders as state A with the subtitle
// "Session · {routineName}" and a dayId-less Start.
//
// All "today" decisions come from the SERVER payload (dashboard.today) —
// the client never computes the date for state.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, Check, MoreVertical, Moon, SkipForward, Target, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { programsApi, routinesApi } from "@/lib/client/api";
import type { DashboardDTO, RoutineDayDTO } from "@/lib/types";
import { todayKey } from "@/lib/client/format";
import { errorMessage, useProgramRun } from "@/features/routines/screen-helpers";

type Props = { dashboard: DashboardDTO };

export function TodayCardSkeleton() {
  return (
    <div className="flex h-[168px] overflow-hidden rounded-lg border bg-card" aria-busy="true" aria-hidden>
      <div className="w-1 flex-none bg-primary/40" />
      <div className="flex-1 animate-pulse bg-muted/30" />
    </div>
  );
}

export function TodayCard({ dashboard }: Props) {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useProgramRun();
  const { today, todayWorkout } = dashboard;

  const [busy, setBusy] = useState(false);
  const [unfollowOpen, setUnfollowOpen] = useState(false);

  const routineId = today.routine?.id ?? null;
  const isSession = today.routine?.kind === "SESSION" || today.scheduled?.sourceType === "SESSION";

  // routine detail → exercise names + predefined set count for the meta line
  const { data: routine } = useQuery({
    queryKey: qk.routine(routineId ?? ""),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
    staleTime: 30_000,
  });

  const resolvedDay: RoutineDayDTO | null = useMemo(() => {
    if (!routine) return null;
    const byId = today.day?.id ? routine.days.find((d) => d.id === today.day?.id) : undefined;
    return byId ?? routine.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null;
  }, [routine, today.day?.id]);

  const exerciseNames = useMemo(
    () =>
      resolvedDay
        ? [...resolvedDay.exercises]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .slice(0, 3)
            .map((re) => re.exercise.name)
        : [],
    [resolvedDay],
  );
  const setCount = resolvedDay ? resolvedDay.exercises.reduce((n, re) => n + re.sets.length, 0) : 0;
  const estMinutes = Math.round((setCount * 3.5) / 5) * 5;

  // first WORKOUT day of the routine (the "Train anyway" target on rest days)
  const firstWorkoutDay = useMemo(
    () => (routine ? routine.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ?? null : null),
    [routine],
  );

  const goToday = () => {
    navigate(today.date === todayKey() ? "/today" : `/today?date=${today.date}`);
  };

  const startWorkout = async (dayId?: string) => {
    if (!routineId) return;
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setBusy(true);
    try {
      const w = await programsApi.startDay(routineId, {
        ...(dayId ? { dayId } : {}),
        date: today.date,
      });
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${today.day?.name ?? today.routine?.name ?? "workout"}`, {
        description: `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} loaded`,
      });
      goToday();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const markRestDone = async () => {
    const res = await run(
      () => programsApi.markRestDone(),
      { path: "/api/programs/cursor/rest-done", method: "POST", label: "Rest day marked done" },
    );
    if (res) toast.success(`Rest done · ${res.day.name} up next`);
  };

  const skipDay = async () => {
    const res = await run(
      () => programsApi.skipCursorDay(),
      { path: "/api/programs/cursor/skip", method: "POST", label: "Day skipped" },
    );
    if (res) toast.success(`Skipped ${res.skipped.name} · ${res.day.name} up next`);
  };

  const unfollow = async () => {
    const ok = await run(
      () => programsApi.unfollow(),
      { path: "/api/programs/follow", method: "DELETE", label: "Program unfollowed" },
    );
    if (ok) toast.success("No program followed");
  };

  // ---------- state C: no program ----------
  if (today.kind === "NONE") {
    return (
      <div
        {...tourAttrs({ id: "home.emptyCard", label: "No program", help: "No program yet — pick one and this card drives your day.", order: 10, when: ["empty"] })}
        className="flex h-[120px] flex-col justify-center gap-2 rounded-lg border bg-card p-3"
      >
        <p className="truncate text-base font-bold leading-none">No program</p>
        <p className="truncate text-xs leading-none text-muted-foreground">
          Follow a program or start a session
        </p>
        <Button
          type="button"
          className="mt-1 h-12 w-full gap-2 whitespace-nowrap text-base font-bold"
          tour={{ id: "home.chooseProgram", label: "Choose program", help: "Browse programs and sessions to follow.", order: 20, when: ["empty"] }}
          onClick={() => navigate("/programs")}
        >
          <Target className="h-5 w-5" aria-hidden />
          Choose program
        </Button>
      </div>
    );
  }

  // ---------- state B: rest day ----------
  if (today.kind === "REST") {
    return (
      <div
        {...tourAttrs({ id: "home.restCard", label: "Rest day", help: "Rest days advance automatically at local midnight.", order: 10 })}
        className="flex h-[120px] flex-col justify-center gap-2 rounded-lg border bg-card p-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Moon className="h-4 w-4 flex-none text-primary" aria-hidden />
          <p className="truncate text-base font-bold leading-none">{today.day?.name ?? "Rest day"}</p>
        </div>
        <p className="truncate text-xs leading-none text-muted-foreground">
          Rest day · advances at midnight
        </p>
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 gap-2 whitespace-nowrap text-sm font-semibold"
            disabled={busy}
            tour={{ id: "home.markRest", label: "Mark rest", help: "Mark today's rest day complete and advance the cursor.", order: 20 }}
            onClick={() => void markRestDone()}
          >
            <Check className="h-4 w-4" aria-hidden />
            Mark rest done
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
            disabled={busy || !routineId || (!firstWorkoutDay && !today.day)}
            tour={{ id: "home.trainAnyway", label: "Train anyway", help: "Start a workout even on a scheduled rest day.", order: 30 }}
            onClick={() => void startWorkout(isSession ? undefined : (today.day?.id ?? firstWorkoutDay?.id ?? undefined))}
          >
            Train anyway
          </Button>
        </div>
      </div>
    );
  }

  // ---------- state A: workout day ----------
  const finished = !!todayWorkout?.finishedAt;
  const started = !!todayWorkout && !finished;
  const subtitle =
    isSession && today.scheduled
      ? `Session · ${today.routine?.name ?? today.scheduled.routineName}`
      : today.day && today.day.count > 0 && today.day.index >= 0
        ? `${today.routine?.name ?? "Program"} · Day ${today.day.index + 1}/${today.day.count}`
        : (today.routine?.name ?? "Program");

  return (
    <div
      {...tourAttrs({ id: "home.todayCard", label: "Today card", help: "Today's session: exercises, set count and your primary action.", order: 10 })}
      className="flex h-[168px] overflow-hidden rounded-lg border bg-card"
    >
      {/* 4px source bar */}
      <div className="w-1 flex-none bg-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
        {/* title row */}
        <div className="flex h-7 flex-none items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-base font-bold leading-none">
            {today.day?.name ?? today.routine?.name ?? "Workout"}
          </p>
          {today.scheduled && (
            <span className="flex h-6 flex-none items-center gap-1 rounded-full border border-primary/50 px-2 text-[10px] font-bold uppercase leading-none text-primary">
              <CalendarClock className="h-3 w-3" aria-hidden />
              Scheduled
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 flex-none p-0"
                aria-label="Program actions"
                tour={{ id: "home.menu", label: "Program menu", help: "Skip day, jump to a day, schedule or unfollow.", order: 40 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => void skipDay()}>
                <SkipForward className="h-4 w-4" aria-hidden /> Skip day
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => routineId && navigate(`/programs/${routineId}?jump=1`)}
              >
                <Target className="h-4 w-4" aria-hidden /> Jump to day…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/schedule/pick?date=${today.date}`)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Schedule instead
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setUnfollowOpen(true)}
              >
                <Unlink className="h-4 w-4" aria-hidden /> Unfollow program
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* subtitle */}
        <p className="truncate text-xs leading-none text-muted-foreground">{subtitle}</p>

        {/* exercise list — up to 3 names, single-line ellipsis */}
        <div className="flex min-h-12 flex-1 flex-col justify-center gap-1">
          {exerciseNames.length > 0 ? (
            exerciseNames.map((name) => (
              <p key={name} className="truncate text-[13px] leading-4 text-foreground/90">
                {name}
              </p>
            ))
          ) : (
            <p className="truncate text-[13px] leading-4 text-muted-foreground">No exercises in this day</p>
          )}
        </div>

        {/* meta line */}
        <p className="flex-none truncate text-xs leading-none text-muted-foreground">
          {setCount > 0 ? `${setCount} sets · ~${estMinutes} min` : "No sets planned"}
        </p>

        {/* primary action — Start → Continue → Finished */}
        <div className="mt-1 flex flex-none gap-2">
          {finished ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled
                className="h-12 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
                aria-label="Workout finished"
              >
                <Check className="h-4 w-4" aria-hidden />
                Finished ✓
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 min-w-0 flex-1 whitespace-nowrap text-sm font-semibold"
                tour={{ id: "home.logAnother", label: "Log another", help: "Open your saved sessions to start another.", order: 20 }}
                onClick={() => navigate("/programs?tab=sessions")}
              >
                Log another session
              </Button>
            </>
          ) : started && todayWorkout ? (
            <Button
              type="button"
              className="h-12 w-full gap-2 whitespace-nowrap text-base font-bold"
              tour={{ id: "home.continue", label: "Continue workout", help: "Jump back into the workout you started today.", order: 20 }}
              onClick={goToday}
            >
              <Check className="h-5 w-5" aria-hidden />
              Continue · {todayWorkout.completedCount}/{todayWorkout.setCount}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-12 w-full gap-2 whitespace-nowrap text-base font-bold"
              disabled={busy || !routineId}
              tour={{ id: "home.start", label: "Start workout", help: "Begin today's session and jump to the logger.", order: 20 }}
              onClick={() => void startWorkout(isSession ? undefined : (today.day?.id ?? resolvedDay?.id ?? undefined))}
            >
              Start workout
            </Button>
          )}
        </div>
      </div>

      {/* confirm-destructive: unfollow */}
      <AlertDialog open={unfollowOpen} onOpenChange={(o) => !o && setUnfollowOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow program?</AlertDialogTitle>
            <AlertDialogDescription>
              {today.routine?.name ?? "This program"} stops driving your Home dashboard, the calendar
              projection and day rollover. Logged workouts stay untouched. You can follow it again any
              time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setUnfollowOpen(false);
                void unfollow();
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

