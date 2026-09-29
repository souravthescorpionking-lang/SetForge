"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BottomBar contents for the Part 8 session screen (§3.10). The BottomBar
// CONTAINER is always the same 56px primitive — its CONTENT swaps while the
// session runs (never more than one of them):
//
//   LogBar          `[ + Add exercise ] [ Log set ✓ ]` — guided AND free mode
//                   (guided completes the pointer set; free the first
//                   incomplete set). All sets done → the primary action
//                   becomes Finish (the one-tap finish, §6.9).
//   RestBar         `Rest 1:12 · Next: Barbell Curl   −15  +15  Skip` — while
//                   a countdown runs; the `Next: …` label appears when the
//                   rest was started by a §6.5 group transition.
//   AddExerciseBar  full-width `+ Add exercise` — session has no exercises yet.
//   FinishedBar     single disabled confirmation row (post-finish window).
//
// Adapted from features/today/rest-bar.tsx + guided-bar.tsx (Part 6/7 logger
// machinery; tour ids re-prefixed session.* — unique to this feature).
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Check, Flag, Minus, Plus, SkipForward, Timer } from "lucide-react";

/** Default content: full-width "+ Add exercise" (session has no exercises). */
export function AddExerciseBar({ onAdd }: { onAdd: () => void }) {
  return (
    <Button
      type="button"
      tour={{ id: "session.addExercise", label: "Add exercise", help: "Open the picker and add an exercise to this session.", order: 70, when: ["empty"] }}
      className="h-11 w-full gap-2 whitespace-nowrap text-base font-bold"
      onClick={onAdd}
      aria-label="Add an exercise to this session"
    >
      <Plus className="h-5 w-5" aria-hidden />
      Add exercise
    </Button>
  );
}

/**
 * Logging content (§3.10): two EQUAL 48px actions, 8px gap —
 * `+ Add exercise` | `Log set ✓` (primary). When every set is done the
 * primary action swaps to Finish so the session can be closed in one tap.
 */
export function LogBar({
  onAdd,
  onLog,
  onFinish,
  canLog,
  allDone,
}: {
  onAdd: () => void;
  /** Complete the current set — guided pointer set, or the first incomplete set in free mode. */
  onLog: () => void;
  onFinish: () => void;
  /** A loggable (incomplete) set exists → Log set enabled. */
  canLog: boolean;
  /** Every set is complete → the primary action becomes Finish. */
  allDone: boolean;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "session.addExercise", label: "Add exercise", help: "Add another exercise to this session.", order: 70, when: ["populated"] }}
        className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
        onClick={onAdd}
        aria-label="Add an exercise to this session"
      >
        <Plus className="h-5 w-5" aria-hidden />
        Add exercise
      </Button>
      {allDone ? (
        <Button
          type="button"
          tour={{ id: "session.finishBar", label: "Finish", help: "All sets done — finish and save this session.", order: 60, when: ["populated"] }}
          className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
          onClick={onFinish}
          aria-label="Finish this session"
        >
          <Flag className="h-5 w-5" aria-hidden />
          Finish
        </Button>
      ) : (
        <Button
          type="button"
          tour={{ id: "session.logSet", label: "Log set", help: "Complete the set the pointer is on (first incomplete in free mode).", order: 60 }}
          className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
          onClick={onLog}
          disabled={!canLog}
          aria-label="Log the current set complete"
        >
          <Check className="h-5 w-5" aria-hidden />
          Log set
        </Button>
      )}
    </>
  );
}

/** Post-finish window content: single disabled confirmation row. */
export function FinishedBar() {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled
      tour={{ id: "session.finished", label: "Finished", help: "This session is already complete.", order: 130, when: ["populated"] }}
      className="h-11 w-full gap-2 text-sm font-bold"
    >
      <Check className="h-5 w-5" aria-hidden />
      Finished ✓
    </Button>
  );
}

/**
 * RestBar content: `Rest 1:12 · Next: X   −15   +15   Skip` — big tabular
 * countdown plus three ≥44px controls. The "Rest" word and the §6.5
 * `Next: …` transition label join at ≥400px (the countdown + icon carry the
 * meaning on 320/360px so the row never overflows).
 */
export function RestBar({
  display,
  label,
  onAdjust,
  onSkip,
}: {
  /** Formatted countdown, e.g. "1:12". */
  display: string;
  /** §6.5 transition label, e.g. "Next: Barbell Curl" (null on normal set rest). */
  label?: string | null;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div
        {...tourAttrs({ id: "session.restBar", label: "Rest countdown", help: "Rest countdown — +/− adjust, Skip ends it. Next names the coming exercise.", order: 80, hint: true, when: ["resting"] })}
        className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap"
      >
        <Timer className="h-5 w-5 flex-none animate-pulse text-primary" aria-hidden />
        <span className="hidden flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground min-[400px]:inline">
          Rest
        </span>
        <span
          className="flex-none text-xl font-bold leading-none tabular-nums text-primary sm:text-2xl"
          role="timer"
          aria-live="polite"
          aria-label={`Rest timer: ${display} remaining${label ? ` — ${label}` : ""}`}
        >
          {display}
        </span>
        {label ? (
          <span className="hidden min-w-0 truncate text-xs font-semibold text-muted-foreground min-[400px]:inline">
            {label}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "session.restMinus15", label: "Less rest", help: "Take 15 seconds off the countdown.", order: 90, when: ["resting"] }}
        className="h-11 w-11 flex-none px-0"
        aria-label="Subtract 15 seconds"
        onClick={() => onAdjust(-15)}
      >
        <Minus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "session.restPlus15", label: "More rest", help: "Add 15 seconds to the countdown.", order: 100, when: ["resting"] }}
        className="h-11 w-11 flex-none px-0"
        aria-label="Add 15 seconds"
        onClick={() => onAdjust(15)}
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        tour={{ id: "session.restSkip", label: "Skip rest", help: "End the rest countdown immediately.", order: 110, when: ["resting"] }}
        className="h-11 flex-none gap-1 whitespace-nowrap px-3 text-sm font-bold sm:px-4"
        onClick={onSkip}
      >
        <SkipForward className="h-4 w-4" aria-hidden />
        Skip
      </Button>
    </>
  );
}
