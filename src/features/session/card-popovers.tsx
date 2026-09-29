"use client";

// Card-level overlays for the Part 8 session screen (§3.10), all rendered
// INSIDE each group card's relative wrapper (mounted on demand) — copied from
// features/today/card-popovers.tsx (today is dead code in Part 8):
//   • ExerciseNotesPopover — read-only display of the exercise's library notes
//     (the per-set note editor lives in each SetRow's ⋯ popover).
//   • ExerciseGroupPopover — superset group membership: existing groups,
//     create-new, remove-from-group (workoutsApi.updateExercise / createGroup).
//   • ConfirmRemoveExercise — the allowed confirm-destructive AlertDialog.
// Anchoring trick: the ⋮ menu closes before these open, so each popover uses a
// 4px invisible absolutely-positioned anchor span at the card's bottom-left
// (absolute subtrees are excluded from the layout harness by design; the
// popover itself portals to body-level fixed).

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Link2, MessageSquareText, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { workoutsApi } from "@/lib/client/api";
import { useInvalidate } from "@/lib/client/query";
import type { ExerciseDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { useMutate } from "./use-mutate";

const anchorSpan = "absolute bottom-2 left-2 h-1 w-1";

// The ⋮ dropdown closes by returning focus to its trigger; a popover mounted
// in that handoff window would instantly dismiss on the focus-outside event.
// Preventing default on focus-outside keeps the popover open (pointerdown
// outside + Escape still close it normally).
const HANDOFF_ANNOTATION_PROPS = {
  onFocusOutside: (e: unknown) => {
    (e as { preventDefault: () => void }).preventDefault();
  },
} as const;

// ---------- exercise notes (read-only library notes) ----------

export function ExerciseNotesPopover({
  exercise,
  open,
  onClose,
}: {
  exercise: ExerciseDTO;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className={anchorSpan} aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72" {...HANDOFF_ANNOTATION_PROPS}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareText className="h-4 w-4 flex-none text-primary" aria-hidden />
          <span className="truncate">{exercise.name}</span>
        </p>
        {exercise.notes ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {exercise.notes}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No notes for this exercise yet.
            <span className="mt-1 block text-xs text-muted-foreground/70">
              Per-set notes are editable from a row&apos;s ⋯ menu.
            </span>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- superset group membership ----------

export function ExerciseGroupPopover({
  workout,
  we,
  open,
  onClose,
}: {
  workout: WorkoutDTO;
  we: WorkoutExerciseDTO;
  open: boolean;
  onClose: () => void;
}) {
  const mutate = useMutate();
  const invalidate = useInvalidate();
  const [newName, setNewName] = useState("");

  const setGroup = async (groupId: string | null) => {
    onClose();
    await mutate({
      label: groupId ? "Added to group" : "Removed from group",
      run: () => workoutsApi.updateExercise(workout.id, we.id, { groupId }),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}`,
        method: "PATCH",
        body: { groupId },
      },
    });
    invalidate.workout();
  };

  const createGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    onClose();
    setNewName("");
    await mutate({
      label: "Group created",
      run: () => workoutsApi.createGroup(workout.id, { name, exerciseIds: [we.id] }),
      queue: {
        path: `/api/workouts/${workout.id}/groups`,
        method: "POST",
        body: { name, exerciseIds: [we.id] },
      },
    });
    invalidate.workout();
    toast.success(`Group “${name}” created`);
  };

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className={anchorSpan} aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64" {...HANDOFF_ANNOTATION_PROPS}>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Superset group
        </p>
        {workout.groups.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No groups in this workout yet.</p>
        ) : (
          <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {workout.groups.map((g) => {
              const current = we.groupId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  {...tourAttrs({ skipTour: true, reason: "Group row inside the superset-group popover" })}
                  onClick={() => void setGroup(g.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors hover:bg-accent",
                    current && "border-primary/50 bg-primary/10",
                  )}
                  aria-pressed={current}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: g.colour }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  {current && <Check className="h-4 w-4 flex-none text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
        {we.groupId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            tour={{ skipTour: true, reason: "Remove-from-group button inside the group popover" }}
            className="mt-2 w-full justify-start gap-2 text-muted-foreground"
            onClick={() => void setGroup(null)}
          >
            <X className="h-4 w-4" aria-hidden /> Remove from group
          </Button>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            New group
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              value={newName}
              placeholder="Group name"
              aria-label="New group name"
              {...tourAttrs({ skipTour: true, reason: "Group name field inside the group popover" })}
              className="h-9 min-w-0 flex-1"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createGroup();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              tour={{ skipTour: true, reason: "Create-group button inside the group popover" }}
              className="h-9 flex-none"
              disabled={!newName.trim()}
              onClick={() => void createGroup()}
            >
              Create
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- confirm-destructive remove ----------

export function ConfirmRemoveExercise({
  exerciseName,
  open,
  onClose,
  onConfirm,
}: {
  exerciseName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove exercise?</AlertDialogTitle>
          <AlertDialogDescription>
            {exerciseName} and all of its sets will be removed from this workout. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            Remove exercise
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
