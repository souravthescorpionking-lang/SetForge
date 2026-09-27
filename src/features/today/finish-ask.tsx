"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FinishAskFlow — §4.11 finishBehaviour="ASK". Finish opens a TWO-action
// AlertDialog (destructive-confirm style — the allowed dialog surface):
//
//   Finish workout?  →  [Discard workout (destructive)] [Save workout (primary)]
//        Discard → SECOND confirm "Discard workout? This can't be undone
//                  after 10 seconds" → workoutLifecycleApi.discard →
//                  toast "Workout discarded" + Undo (10s, restore) →
//                  invalidate workout/dashboard/programs/schedule → refetch.
//        Save    → the existing finish flow (unchanged ALWAYS_SAVE path).
//
// ALWAYS_SAVE (the default) never mounts this component at all.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { ApiError, workoutLifecycleApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { hapticError, hapticWarning } from "@/lib/client/haptics";
import type { WorkoutDTO } from "@/lib/types";

export function FinishAskFlow({
  workout,
  open,
  onClose,
  onSave,
  dateKey,
  onDiscarded,
}: {
  workout: WorkoutDTO | null;
  /** Ask-stage open flag (owned by the screen). */
  open: boolean;
  onClose: () => void;
  /** Continue into the existing finish flow (the ALWAYS_SAVE path). */
  onSave: () => void;
  /** Day key for targeted refetch after discard/restore. */
  dateKey: string;
  /** Fired after a successful discard so the screen can reset local state. */
  onDiscarded?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  const refreshAll = async () => {
    invalidate.workout(dateKey);
    invalidate.dashboard();
    invalidate.schedule();
    invalidate.programs();
    await qc.refetchQueries({ queryKey: qk.workoutByDate(dateKey) });
  };

  const restore = async (id: string) => {
    try {
      await workoutLifecycleApi.restore(id);
      await refreshAll();
      toast.success("Workout restored");
    } catch (e) {
      hapticError();
      if (e instanceof ApiError && e.status === 409) {
        toast.info("That date already has a workout — restore it from Settings → Hidden workouts");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not restore");
      }
    }
  };

  const discard = async () => {
    if (!workout) return;
    setConfirmOpen(false);
    if (!online) {
      toast.info("Discarding needs a connection");
      return;
    }
    try {
      await workoutLifecycleApi.discard(workout.id);
      await refreshAll();
      onDiscarded?.();
      toast.success("Workout discarded", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => void restore(workout.id),
        },
      });
    } catch (e) {
      hapticError();
      toast.error(e instanceof Error ? e.message : "Could not discard workout");
    }
  };

  return (
    <>
      {/* Stage 1 — Save | Discard */}
      <AlertDialog open={open && !confirmOpen} onOpenChange={(o) => !o && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Save this session to your history, or discard it entirely. Discarded workouts can be
              restored for 10 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                hapticWarning();
                setConfirmOpen(true);
              }}
            >
              Discard workout
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onClose();
                onSave();
              }}
            >
              Save workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stage 2 — destructive confirm */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) onClose();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Every exercise and set logged today will be hidden from your history. This can&apos;t
              be undone after 10 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep workout</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void discard();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
