"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramCard — the fixed 128px card at the top of #/workout (Part 8 §3.1).
//
// Exactly FOUR states, all h-[128px] (no CLS between states). Inner rows are
// 48 / 40 / 40 px (rowTall + rowBase + rowBase) — the third row is the ONE
// primary button of the screen:
//
//   NONE        "No program selected" / "Follow a routine to get a plan" /
//               [Choose program] → #/programs
//   FOLLOWING   ▌name · Day i/n · dayName / exercise names (muted, ellipsized) /
//               [Start Day i] → POST start-day → #/session
//   REST        ▌name · Day i/n · Rest / "Advances at midnight" /
//               [Train anyway] → #/on-demand
//   IN PROGRESS same header / live exercise names / [Continue · d/t ✓] → #/session
//
// The 4px left bar is the program/group colour — the in-progress session's
// first group colour when present, primary otherwise. Scheduled-today
// override: the dashboard's `today` payload already resolves a PLANNED
// schedule entry over the cursor day (server-side), so this card renders
// today's resolved day; day index/count are recomputed from the routine
// detail (correct even when the scheduled routine ≠ the followed one).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { programsApi } from "@/lib/client/api";
import { rowBase, rowTall } from "@/lib/ui/tokens";
import { errorMessage } from "@/features/routines/screen-helpers";
import type { DashboardDTO, RoutineDayDTO, RoutineDTO, WorkoutDTO } from "@/lib/types";

export type ProgramCardProps = {
  dashboard: DashboardDTO;
  /** The in-progress session (any date) — workoutsApi.active().workout. */
  activeWorkout: WorkoutDTO | null;
  /** Routine detail behind the card (screen-owned query; undefined while loading). */
  routine: RoutineDTO | undefined;
};

type CardModel =
  | { state: "none" }
  | { state: "rest"; title: string }
  | {
      state: "following";
      title: string;
      subtitle: string;
      routineId: string;
      routineName: string;
      dayId: string | null;
      dayName: string | null;
      dayNumber: number | null;
      dateKey: string;
      isSession: boolean;
    }
  | { state: "inprogress"; title: string; subtitle: string; completed: number; total: number };

/** `name · Day 2/6 · Pull` — day parts are skipped for single-day sessions. */
function titleLine(parts: {
  routineName: string;
  isSession: boolean;
  dayName: string | null;
  dayNumber: number | null;
  dayCount: number | null;
}): string {
  const out = [parts.routineName];
  if (!parts.isSession && parts.dayNumber != null && parts.dayCount != null && parts.dayCount > 0) {
    out.push(`Day ${parts.dayNumber}/${parts.dayCount}`);
  }
  if (!parts.isSession && parts.dayName) out.push(parts.dayName);
  return out.join(" · ");
}

/** Up to 4 exercise names of a routine day, single-line, ellipsized by the row. */
function dayExercisesLine(day: RoutineDayDTO | null): string {
  if (!day) return "…";
  const names = [...day.exercises]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 4)
    .map((re) => re.exercise.name);
  return names.length > 0 ? names.join(" · ") : "No exercises planned";
}

/** Live exercise names of the in-progress session. */
function workoutExercisesLine(workout: WorkoutDTO): string {
  const names = [...workout.exercises]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 4)
    .map((we) => we.exercise.name);
  return names.length > 0 ? names.join(" · ") : "Session in progress";
}

function resolveCardModel(
  dashboard: DashboardDTO,
  activeWorkout: WorkoutDTO | null,
  routine: RoutineDTO | undefined,
): CardModel {
  const { today, active: activeRoutine, todayWorkout } = dashboard;
  const scheduled = today.scheduled; // today's PLANNED entry (server-resolved)

  // ---- 4. IN PROGRESS: an unfinished started session (any date) wins ----
  if (activeWorkout && activeWorkout.finishedAt == null && activeWorkout.removedAt == null) {
    const isSession = activeWorkout.sourceType === "SESSION" || routine?.kind === "SESSION";
    const routineName =
      routine?.name ??
      (today.routine?.id === activeWorkout.sourceRoutineId ? today.routine.name : null) ??
      (activeWorkout.sourceType === "FREESTYLE" ? "Freestyle session" : "Workout");
    let dayName: string | null = null;
    let dayNumber: number | null = null;
    let dayCount: number | null = null;
    if (routine && activeWorkout.sourceDayId) {
      const idx = routine.days.findIndex((d) => d.id === activeWorkout.sourceDayId);
      if (idx >= 0) {
        dayName = routine.days[idx]!.name;
        dayNumber = idx + 1;
        dayCount = routine.days.length;
      }
    } else if (today.day && todayWorkout?.id === activeWorkout.id) {
      dayName = today.day.name;
      dayNumber = today.day.index >= 0 ? today.day.index + 1 : null;
      dayCount = today.day.count > 0 ? today.day.count : null;
    }
    // counts: server-computed todayWorkout when it IS this session, else payload
    const tw = todayWorkout?.id === activeWorkout.id ? todayWorkout : null;
    const total = tw
      ? tw.setCount
      : activeWorkout.exercises.reduce((n, e) => n + e.sets.length, 0);
    const completed = tw
      ? tw.completedCount
      : activeWorkout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.isComplete).length, 0);
    return {
      state: "inprogress",
      title: titleLine({ routineName, isSession, dayName, dayNumber, dayCount }),
      subtitle: workoutExercisesLine(activeWorkout),
      completed,
      total,
    };
  }

  // ---- 1. NONE: no followed program and nothing scheduled today ----
  if (today.kind === "NONE" && !activeRoutine) return { state: "none" };

  // ---- 2/3. FOLLOWING or REST — today already prefers a PLANNED schedule
  //      entry over the cursor day (server-side resolution). ----
  const routineName = today.routine?.name ?? activeRoutine?.routineName ?? "Program";
  const isSession =
    scheduled?.sourceType === "SESSION" ||
    today.routine?.kind === "SESSION" ||
    routine?.kind === "SESSION" ||
    activeRoutine?.routineKind === "SESSION";

  const wantDayId = today.day?.id ?? scheduled?.dayId ?? activeRoutine?.dayId ?? null;
  let resolved: RoutineDayDTO | null = null;
  if (routine) {
    resolved =
      (wantDayId ? routine.days.find((d) => d.id === wantDayId) ?? null : null) ??
      routine.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST") ??
      null; // scheduled SESSION (no dayId) fallback
  }
  const dayName = today.day?.name ?? scheduled?.dayName ?? resolved?.name ?? null;
  const dayNumber =
    resolved != null && routine
      ? routine.days.indexOf(resolved) + 1
      : today.day && today.day.index >= 0 && today.day.count > 0
        ? today.day.index + 1
        : null;
  const dayCount = routine ? (routine.days.length > 0 ? routine.days.length : null) : today.day && today.day.count > 0 ? today.day.count : null;
  const dayType = today.day?.dayType ?? resolved?.dayType ?? activeRoutine?.dayType ?? "WORKOUT";

  const title = titleLine({ routineName, isSession, dayName, dayNumber, dayCount });

  if (dayType === "REST") return { state: "rest", title };

  return {
    state: "following",
    title,
    subtitle: routine ? dayExercisesLine(resolved) : "…",
    routineId: today.routine?.id ?? activeRoutine?.routineId ?? "",
    routineName,
    dayId: resolved?.id ?? wantDayId,
    dayName,
    dayNumber,
    dateKey: today.date,
    isSession,
  };
}

/** 128px loading skeleton — same footprint as the card (no CLS). */
export function ProgramCardSkeleton() {
  return (
    <div className="flex h-[128px] w-full flex-none overflow-hidden rounded-lg border bg-card" aria-busy="true" aria-hidden>
      <div className="w-1 flex-none bg-primary/40" />
      <div className="flex-1 animate-pulse bg-muted/30" />
    </div>
  );
}

export function ProgramCard({ dashboard, activeWorkout, routine }: ProgramCardProps) {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  const model = useMemo(
    () => resolveCardModel(dashboard, activeWorkout, routine),
    [dashboard, activeWorkout, routine],
  );

  const startDay = async () => {
    if (model.state !== "following" || busy || !model.routineId) return;
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setBusy(true);
    try {
      const w = await programsApi.startDay(model.routineId, {
        ...(model.dayId ? { dayId: model.dayId } : {}),
        date: model.dateKey,
      });
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${model.dayName ?? model.routineName}`, {
        description: `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} loaded`,
      });
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const title =
    model.state === "none" ? "No program selected" : model.title;
  const subtitle =
    model.state === "none"
      ? "Follow a routine to get a plan"
      : model.state === "rest"
        ? "Advances at midnight"
        : model.subtitle;

  const barColour =
    model.state === "inprogress" && activeWorkout ? activeWorkout.groups[0]?.colour ?? null : null;

  return (
    <section
      aria-label="Program card"
      className="flex h-[128px] w-full flex-none overflow-hidden rounded-lg border bg-card"
    >
      {/* 4px program/group colour bar */}
      <div
        className="w-1 flex-none bg-primary"
        style={barColour ? { backgroundColor: barColour } : undefined}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 48px title row */}
        <div data-row className={`${rowTall} flex-none px-4`}>
          <p className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{title}</p>
        </div>
        {/* 40px subtitle row — exercise names, single-line ellipsis */}
        <div data-row className={`${rowBase} flex-none px-4`}>
          <p className="min-w-0 flex-1 truncate text-sm leading-none text-muted-foreground">{subtitle}</p>
        </div>
        {/* 40px primary action row — the screen's ONE primary button */}
        <div data-row className={`${rowBase} flex-none px-3`}>
          {model.state === "none" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{ id: "workout.choose", label: "Choose program", help: "Browse programs and sessions to follow.", order: 10 }}
              onClick={() => navigate("/programs")}
            >
              Choose program
            </Button>
          ) : model.state === "rest" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{ id: "workout.trainAnyway", label: "Train anyway", help: "Pick a ready session to train on a rest day.", order: 10 }}
              onClick={() => navigate("/on-demand")}
            >
              Train anyway
            </Button>
          ) : model.state === "following" ? (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              disabled={busy || !model.routineId}
              tour={{ id: "workout.start", label: "Start day", help: "Create today's session from this day and jump into it.", order: 10 }}
              onClick={() => void startDay()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {model.isSession
                ? "Start session"
                : model.dayNumber != null
                  ? `Start Day ${model.dayNumber}`
                  : "Start workout"}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-10 w-full text-sm font-semibold"
              tour={{ id: "workout.continue", label: "Continue", help: "Jump back into the session you have in progress.", order: 10 }}
              onClick={() => navigate("/session")}
            >
              Continue · {model.completed}/{model.total} ✓
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
