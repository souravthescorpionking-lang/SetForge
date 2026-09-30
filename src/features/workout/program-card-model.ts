"use client";

// ─────────────────────────────────────────────────────────────────────────────
// program-card-model.ts — the SHARED state + action logic behind every
// "current program" card (Part 9 §11 Home card + Part 10 §7 Dashboard card).
//
//   resolveCardModel(dashboard, activeWorkout, routine, programs) → CardModel
//       the pure 5-state resolution (inprogress / none / following / rest).
//   useProgramCardActions(model)
//       the ONE start-day / rest-day-mark-off flow (same offline handling,
//       invalidations and toasts for both cards).
//
// Extracted from program-card.tsx (Part 10 §7) so the Dashboard compact card
// reuses the exact logic — never a fork. The queries stay in the screens (the
// Home screen also uses them for its own counts); the query KEYS are the
// shared cache family either way.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { programsApi } from "@/lib/client/api";
import { errorMessage, useProgramRun } from "@/features/routines/screen-helpers";
import type {
  DashboardDTO,
  ProgramSummaryDTO,
  RoutineDayDTO,
  RoutineDTO,
  WorkoutDTO,
} from "@/lib/types";

export type CardModel =
  | { state: "none" }
  | { state: "rest"; programName: string; routineId: string; subtitle: string | null }
  | {
      state: "following";
      programName: string;
      routineId: string;
      routineName: string;
      dayId: string | null;
      dayName: string | null;
      dayNumber: number | null;
      dateKey: string;
      isSession: boolean;
      subtitle: string | null;
    }
  | {
      state: "inprogress";
      programName: string;
      routineId: string | null;
      subtitle: string;
      completed: number;
      total: number;
    };

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

export function resolveCardModel(
  dashboard: DashboardDTO,
  activeWorkout: WorkoutDTO | null,
  routine: RoutineDTO | undefined,
  programs: ProgramSummaryDTO[] | undefined,
): CardModel {
  const { today, active: activeRoutine, todayWorkout } = dashboard;
  const scheduled = today.scheduled; // today's PLANNED entry (server-resolved)
  /** Catalog row of the routine the card is about (tagline/notes fallback). */
  const rowOf = (id: string | null | undefined) =>
    id ? (programs?.find((p) => p.id === id) ?? null) : null;
  const taglineOf = (id: string | null | undefined) => {
    const row = rowOf(id);
    return row?.tagline ?? row?.notes ?? routine?.notes ?? null;
  };

  // ---- 1. IN PROGRESS: an unfinished started session (any date) wins ----
  if (activeWorkout && activeWorkout.finishedAt == null && activeWorkout.removedAt == null) {
    const isSession = activeWorkout.sourceType === "SESSION" || routine?.kind === "SESSION";
    const routineName =
      routine?.name ??
      (today.routine?.id === activeWorkout.sourceRoutineId ? today.routine.name : null) ??
      (activeWorkout.sourceType === "FREESTYLE" ? "Freestyle session" : "Workout");
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
      programName: routineName,
      routineId: activeWorkout.sourceRoutineId ?? null,
      subtitle: workoutExercisesLine(activeWorkout),
      completed,
      total,
    };
  }

  // ---- 2. NONE: no followed program and nothing scheduled today ----
  if (today.kind === "NONE" && !activeRoutine) return { state: "none" };

  // ---- 3/4. FOLLOWING or REST — today already prefers a PLANNED schedule
  //      entry over the cursor day (server-side resolution). ----
  const programName = today.routine?.name ?? activeRoutine?.routineName ?? "Program";
  const routineId = today.routine?.id ?? activeRoutine?.routineId ?? "";
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
  const dayType = today.day?.dayType ?? resolved?.dayType ?? activeRoutine?.dayType ?? "WORKOUT";

  if (dayType === "REST") {
    return {
      state: "rest",
      programName,
      routineId,
      subtitle: taglineOf(routineId) ?? "Advances at midnight",
    };
  }

  return {
    state: "following",
    programName,
    routineId,
    routineName: programName,
    dayId: resolved?.id ?? wantDayId,
    dayName,
    dayNumber,
    dateKey: today.date,
    isSession,
    subtitle: taglineOf(routineId) ?? (routine ? dayExercisesLine(resolved) : "…"),
  };
}

/** The shared card actions: start-day (following) + rest-day mark-off. */
export function useProgramCardActions(model: CardModel): {
  busy: boolean;
  startDay: () => Promise<void>;
  markRestDone: () => Promise<void>;
} {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { run } = useProgramRun();
  const [busy, setBusy] = useState(false);

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

  const markRestDone = async () => {
    if (model.state !== "rest" || busy) return;
    setBusy(true);
    const res = await run(
      () => programsApi.markRestDone(),
      { path: "/api/programs/cursor/rest-done", method: "POST", label: "Rest day marked done" },
    );
    if (res) toast.success(`Rest done · ${res.day.name} up next`);
    setBusy(false);
  };

  return { busy, startDay, markRestDone };
}
