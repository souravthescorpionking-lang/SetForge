"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Screen-level overlays for the Part 8 session screen (§3.10 ⋮ menu):
//   • NotePopover          — the session note (workout.comment) editor, an
//                            anchored popover with a textarea → PATCH workout.
//   • TransitionRestPopover — §6.5 per-SESSION transition-rest override
//                            (client-side state: null = exercise ?? settings
//                            default; 0 = off; presets 30–180 s).
//   • DiscardConfirmDialog — §6.9 destructive confirm for ✕ → Discard:
//                            workoutLifecycleApi.discard reverts cursor and
//                            schedule server-side; Undo restores within 10 s.
//
// Anchoring: both popovers mount after the ⋮ dropdown closes, so they use the
// card-popovers trick — a 4px invisible absolutely-positioned anchor span +
// preventDefault on focus-outside (pointerdown outside + Escape still close).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { ArrowRightLeft, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { ApiError, workoutLifecycleApi, workoutsApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { hapticError, hapticWarning } from "@/lib/client/haptics";
import type { WorkoutDTO } from "@/lib/types";
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

// ---------- session note (workout.comment) ----------

export function NotePopover({
  workout,
  open,
  onClose,
}: {
  workout: WorkoutDTO;
  open: boolean;
  onClose: () => void;
}) {
  const mutate = useMutate();
  const [draft, setDraft] = useState(workout.comment ?? "");
  const [lastOpen, setLastOpen] = useState(false);
  // reset the draft during render whenever the popover (re)opens
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(workout.comment ?? "");
  }

  const save = async () => {
    const comment = draft.trim() ? draft.trim() : null;
    onClose();
    await mutate({
      label: "Session note saved",
      run: () => workoutsApi.update(workout.id, { comment }),
      queue: {
        path: `/api/workouts/${workout.id}`,
        method: "PATCH",
        body: { comment },
      },
    });
    toast.success(comment ? "Note saved" : "Note removed");
  };

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className={anchorSpan} aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80" {...HANDOFF_ANNOTATION_PROPS}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Session note
        </p>
        <Textarea
          value={draft}
          autoFocus
          aria-label="Session note"
          placeholder="How did this session feel?"
          {...tourAttrs({ skipTour: true, reason: "Note textarea inside the session-note popover" })}
          className="mt-2 min-h-24 text-sm"
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            tour={{ skipTour: true, reason: "Cancel button inside the session-note popover" }}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            tour={{ skipTour: true, reason: "Save button inside the session-note popover" }}
            onClick={() => void save()}
          >
            Save note
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- §6.5 per-session transition rest ----------

const TRANSITION_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: "Default", value: null },
  { label: "Off", value: 0 },
  { label: "30 s", value: 30 },
  { label: "60 s", value: 60 },
  { label: "90 s", value: 90 },
  { label: "2 m", value: 120 },
  { label: "3 m", value: 180 },
];

export function TransitionRestPopover({
  open,
  onClose,
  value,
  onChange,
  defaultLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** Session override: null = exercise ?? settings default, 0 = off. */
  value: number | null;
  onChange: (v: number | null) => void;
  /** Resolved default for the current display, e.g. "60 s (Bench Press)". */
  defaultLabel: string;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className={anchorSpan} aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64" {...HANDOFF_ANNOTATION_PROPS}>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden /> Transition rest
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Rest when the pointer moves to a new group. Default: {defaultLabel}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {TRANSITION_PRESETS.map((p) => {
            const active = value === p.value;
            return (
              <button
                key={p.label}
                type="button"
                {...tourAttrs({ skipTour: true, reason: "Transition rest preset inside the popover" })}
                aria-pressed={active}
                onClick={() => {
                  onChange(p.value);
                  onClose();
                }}
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- §6.9 discard confirm (✕ → Discard) ----------

export function DiscardConfirmDialog({
  workout,
  open,
  onClose,
  onDiscarded,
  dayKey,
}: {
  workout: WorkoutDTO | null;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful discard (screen navigates to #/workout). */
  onDiscarded: () => void;
  /** Day key for targeted refetch after discard/restore. */
  dayKey: string;
}) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  const refreshAll = async () => {
    invalidate.workout(dayKey);
    invalidate.dashboard();
    invalidate.schedule();
    invalidate.programs();
    await qc.refetchQueries({ queryKey: qk.workoutByDate(dayKey) });
    await qc.refetchQueries({ queryKey: ["workout", "active"] });
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

  const discard = async () => {
    if (!workout) return;
    onClose();
    if (!online) {
      toast.info("Discarding needs a connection");
      return;
    }
    try {
      await workoutLifecycleApi.discard(workout.id);
      await refreshAll();
      onDiscarded();
      toast.success("Session discarded", {
        description: "Program cursor and schedule were reverted",
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => void restore(workout.id),
        },
      });
    } catch (e) {
      hapticError();
      toast.error(e instanceof Error ? e.message : "Could not discard session");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 flex-none text-destructive" aria-hidden />
            Discard this session?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Every exercise and set logged in this session will be hidden, and the program cursor and
            schedule revert to before it started. You can undo for 10 seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => hapticWarning()}>Keep going</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void discard();
            }}
          >
            Discard session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
