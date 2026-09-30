"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useChangeDifficulty — Part 10 §2. The ONE difficulty-change flow, shared by
// the Programs SubBar segmented control and the Home program-card chip (both
// render the same destructive-confirm modal + call the same server action).
//
//   const { difficulty, switching, confirm, request, dialog } = useChangeDifficulty();
//   request(next)            → followed program? confirm.next = next : apply now
//   <confirm.Dialog />       → the §2 modal (from {old} to {new}. Current
//                              program restarts at Phase 1 Day 1.)
//
// Server action: userApi.setDifficulty (Part 9 §2 core). On success: session
// store copy + ["session"]/["programs"]/["dashboard"]/["schedule"]/
// ["program-detail"] invalidated; variantKept → "No {X} version. Kept {Y}."
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
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
import { useApp } from "@/lib/client/store";
import { userApi } from "@/lib/client/api";
import { qk, useDashboard, useInvalidate, useSession } from "@/lib/client/query";
import { DIFFICULTY_LABELS, type Difficulty } from "@/lib/constants";
import { errorMessage } from "./screen-helpers";

export type ChangeDifficultyState = {
  /** The user's current difficulty (optimistic overlay included). */
  difficulty: Difficulty;
  /** A switch is in flight (disable the trigger). */
  switching: boolean;
  /** Pending confirmed target (non-null while the modal is open). */
  confirm: {
    next: Difficulty;
    /** The shared §2 modal — render once per screen. */
    Dialog: () => React.JSX.Element;
  } | null;
  /** Ask for a difficulty change. Confirms first when a program is followed. */
  request: (next: Difficulty) => void;
};

export function useChangeDifficulty(): ChangeDifficultyState {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const session = useApp((s) => s.session);
  const setSession = useApp((s) => s.setSession);
  const sessionQuery = useSession();

  const storeDifficulty = session?.user.difficulty ?? null;
  const serverDifficulty = (sessionQuery.data?.user?.difficulty ?? storeDifficulty ?? "INTERMEDIATE") as Difficulty;
  const [optimistic, setOptimistic] = useState<Difficulty | null>(null);
  const [pending, setPending] = useState<Difficulty | null>(null);
  const [switching, setSwitching] = useState(false);

  const difficulty = optimistic ?? serverDifficulty;

  // The modal copy depends on whether a program is currently followed (§2).
  const dashboard = useDashboard();
  const followed = dashboard.data?.active ?? null;

  // Once the server cache carries the optimistic value the overlay is
  // redundant (same selection either way — no flicker).
  useEffect(() => {
    if (optimistic != null && optimistic === serverDifficulty) setOptimistic(null);
  }, [optimistic, serverDifficulty]);

  const apply = async (next: Difficulty) => {
    if (switching || next === serverDifficulty) return;
    setSwitching(true);
    setOptimistic(next);
    try {
      const res = await userApi.setDifficulty(next);
      if (session?.user) {
        setSession({ ...session, user: { ...session.user, difficulty: res.difficulty } });
      }
      await qc.invalidateQueries({ queryKey: qk.session });
      invalidate.programs(); // ["programs"] + ["dashboard"]
      invalidate.schedule();
      invalidate.programDetail();
      if (res.variantKept) {
        const kept = DIFFICULTY_LABELS[res.variantKept as Difficulty] ?? res.variantKept;
        toast.info(`No ${DIFFICULTY_LABELS[next]} version. Kept ${kept}.`);
      }
    } catch (e) {
      setOptimistic(null);
      toast.error(errorMessage(e));
    } finally {
      setSwitching(false);
    }
  };

  const request = (next: Difficulty) => {
    if (switching || next === difficulty) return;
    if (followed) {
      setPending(next); // §2: current program restarts — confirm first
      return;
    }
    void apply(next); // no active program → plain switch, no confirm
  };

  const Dialog = () => (
    <AlertDialog open={pending != null} onOpenChange={(o) => !o && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change difficulty</AlertDialogTitle>
          <AlertDialogDescription>
            From {DIFFICULTY_LABELS[difficulty]} to {DIFFICULTY_LABELS[pending ?? difficulty]}. Current program restarts
            at Phase 1 Day 1.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              const next = pending;
              setPending(null);
              if (next) void apply(next);
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    difficulty,
    switching,
    confirm: pending != null ? { next: pending, Dialog } : null,
    request,
  };
}
