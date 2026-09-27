"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GuidedBar — §4.11 guided-mode BottomBar content:
//
//   [◀ Prev 44px] [Log set ✓ flex-1] [Next ▶ 44px]
//
// Guided mode replaces the Add/Finish pair while the workout is UNFINISHED.
// When every set of the guided order is done the middle action becomes the
// Finish button (the only finish entry point while guided — documented
// deviation, keeps Finish reachable). h-11 buttons, single line, 8px gap from
// the BottomBar container — zero layout changes to the 56px BottomBar itself.
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight, Flag } from "lucide-react";

export function GuidedBar({
  onPrev,
  onNext,
  onLog,
  onFinish,
  canLog,
  allDone,
  atStart,
}: {
  /** Move the pointer to the previous incomplete set. */
  onPrev: () => void;
  /** Move the pointer to the next incomplete set. */
  onNext: () => void;
  /** Complete the current set (existing toggle-done mutation + auto-rest). */
  onLog: () => void;
  /** Finish the workout (finishBehaviour-aware). */
  onFinish: () => void;
  /** Current pointer set exists and is incomplete → Log set enabled. */
  canLog: boolean;
  /** Every set in the guided order is complete → middle action = Finish. */
  allDone: boolean;
  /** Pointer sits on the first entry → Prev disabled. */
  atStart: boolean;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-11 flex-none px-0"
        aria-label="Previous set"
        onClick={onPrev}
        disabled={atStart}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </Button>
      {allDone ? (
        <Button
          type="button"
          className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
          onClick={onFinish}
          aria-label="Finish this workout"
        >
          <Flag className="h-5 w-5" aria-hidden />
          Finish
        </Button>
      ) : (
        <Button
          type="button"
          className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
          onClick={onLog}
          disabled={!canLog}
          aria-label="Log the current set complete"
        >
          <Check className="h-5 w-5" aria-hidden />
          Log set
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-11 flex-none px-0"
        aria-label="Next set"
        onClick={onNext}
        disabled={allDone}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Button>
    </>
  );
}
