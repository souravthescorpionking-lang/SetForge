"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EndWorkoutDialog — Part 10 §3.6: THE single exit flow (replaces the Part 8
// ✕ menu Finish · Discard · Keep going). Rendered by #/session (✕, the
// all-done BottomBar primary) and #/session/settings (danger row).
//
//   Title "End this workout?"
//   Body  "{n} of {N} sets logged. Total time {t}."
//   Checkbox row 40 "Mark as complete" — default ON when n ≥ 1, else OFF
//   Buttons Cancel · End
//
// End semantics (server-side, POST /api/workouts/:id/end):
//   mark ON  → finish: markedComplete, totalVolume/totalSets, cursor advance,
//              summary toast with 10s Undo → #/workout
//   mark OFF → n=0: discard ("Workout discarded") · n>0: partial save
//              ("Saved as partial", no cursor move, schedule back to PLANNED)
// Logged sets are never lost on any path.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import { ApiError, workoutsApi, workoutLifecycleApi, routinesApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { hapticError, hapticWarning } from "@/lib/client/haptics";
import type { WorkoutDTO } from "@/lib/types";
import { formatTotalTime } from "./time";

export function EndWorkoutDialog({
  workout,
  elapsedSec,
  open,
  onClose,
  onEnded,
}: {
  workout: WorkoutDTO | null;
  /** Live now − startAt seconds (the screen's §3.2 ticker). */
  elapsedSec: number | null;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful end (screen navigates to #/workout). */
  onEnded: () => void;
}) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  const completed = workout
    ? workout.exercises.reduce((n, we) => n + we.sets.filter((s) => s.isComplete).length, 0)
    : 0;
  const total = workout
    ? workout.exercises.reduce((n, we) => n + we.sets.length, 0)
    : 0;

  // §3.6: checkbox defaults ON when at least one set is logged, else OFF.
  const [markComplete, setMarkComplete] = useState(completed >= 1);
  useEffect(() => {
    if (open) setMarkComplete(completed >= 1);
  }, [open, completed]);

  // "Day X up next" label for the finish toast (routine days; fallback name).
  const routinesQuery = useQuery({
    queryKey: qk.routines,
    queryFn: () => routinesApi.list(),
    staleTime: 60_000,
  });
  const routines = routinesQuery.data?.routines;
  const nextDayLabel = (nextDay: { id: string; name: string; dayType: string } | null, routineId: string | null): string => {
    if (!nextDay) return "Done";
    const routine = routines?.find((r) => r.id === routineId);
    const idx = routine?.days.findIndex((d) => d.id === nextDay?.id) ?? -1;
    return idx >= 0 ? `Day ${idx + 1} up next` : `${nextDay.name} up next`;
  };

  const refreshAll = async () => {
    invalidate.workout();
    invalidate.dashboard();
    invalidate.schedule();
    invalidate.programs();
    await qc.refetchQueries({ queryKey: ["workout", "active"] });
  };

  const undoFinish = async (workoutId: string) => {
    try {
      await workoutsApi.undoFinish(workoutId);
      await refreshAll();
      toast.success("Finish undone — keep logging");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        toast.info("Too late to undo (past the 10s window)");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not undo");
      }
    }
  };

  const restore = async (id: string) => {
    try {
      await workoutLifecycleApi.restore(id);
      await refreshAll();
      toast.success("Session restored");
    } catch (e) {
      hapticError();
      if (e instanceof ApiError && e.status === 409) {
        toast.info("That date already has a session — restore it from Settings → Hidden workouts");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not restore");
      }
    }
  };

  const end = async () => {
    if (!workout) return;
    onClose();
    if (!online) {
      toast.info("Ending needs a connection");
      return;
    }
    try {
      const res = await workoutsApi.end(workout.id, { markComplete });
      await refreshAll();
      onEnded();
      if (res.discarded) {
        // mark OFF + 0 sets → discard semantics (§6.9 flow, 10s Undo).
        toast.success("Workout discarded", {
          duration: 10_000,
          action: { label: "Undo", onClick: () => void restore(workout.id) },
        });
      } else if (!res.markedComplete) {
        // mark OFF + sets logged → partial save; schedule stays PLANNED.
        toast.success("Saved as partial", {
          description: `${res.totalSets} set${res.totalSets === 1 ? "" : "s"} kept — the day didn't count`,
          duration: 10_000,
        });
      } else {
        toast.success(`Session finished · ${nextDayLabel(res.nextDay, workout.sourceRoutineId)}`, {
          duration: 10_000,
          action: { label: "Undo", onClick: () => void undoFinish(workout.id) },
        });
      }
    } catch (e) {
      hapticError();
      if (e instanceof ApiError && e.status === 409) {
        // Idempotent: already ended — just leave.
        onEnded();
        toast.info("This session is already ended");
        await refreshAll();
      } else {
        toast.error(e instanceof Error ? e.message : "Could not end session");
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this workout?</AlertDialogTitle>
          <AlertDialogDescription>
            {completed} of {total} sets logged. Total time{" "}
            {elapsedSec != null ? formatTotalTime(elapsedSec) : "–"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          data-row
          className="flex h-10 items-center gap-3 rounded-md border bg-muted/30 px-3"
        >
          <Checkbox
            id="end-mark-complete"
            checked={markComplete}
            {...tourAttrs({ skipTour: true, reason: "Mark-as-complete checkbox inside the end-workout dialog" })}
            onCheckedChange={(v) => setMarkComplete(v === true)}
            aria-label="Mark as complete"
          />
          <label
            htmlFor="end-mark-complete"
            className="min-w-0 flex-1 cursor-pointer select-none text-sm font-medium leading-none"
          >
            Mark as complete
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            {...tourAttrs({ skipTour: true, reason: "Cancel action inside the end-workout dialog" })}
            onClick={() => hapticWarning()}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            {...tourAttrs({ skipTour: true, reason: "End action inside the end-workout dialog" })}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void end();
            }}
          >
            End
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
