"use client";

// BottomBar contents for the Today screen. The BottomBar CONTAINER is always
// the same 56px primitive — its CONTENT swaps between the add button, the
// add+finish pair, the finished row and the RestBar while a rest countdown
// runs (never more than one of them).

import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Check, Flag, Minus, Plus, SkipForward, Timer } from "lucide-react";

/** Default content: full-width "+ Add exercise". */
export function AddExerciseBar({ onAdd }: { onAdd: () => void }) {
  return (
    <Button
      type="button"
      tour={{ id: "today.addExercise", label: "Add exercise", help: "Open the picker and start building this day.", order: 60, when: ["empty"] }}
      className="h-11 w-full gap-2 whitespace-nowrap text-base font-bold"
      onClick={onAdd}
      aria-label="Add an exercise to this workout"
    >
      <Plus className="h-5 w-5" aria-hidden />
      Add exercise
    </Button>
  );
}

/**
 * Logging-in-progress content: two EQUAL 48px actions, 8px gap —
 * `+ Add exercise` | `Finish`.
 */
export function FinishBar({ onAdd, onFinish }: { onAdd: () => void; onFinish: () => void }) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "today.addExercise", label: "Add exercise", help: "Add another exercise to this workout.", order: 60, when: ["populated"] }}
        className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
        onClick={onAdd}
        aria-label="Add an exercise to this workout"
      >
        <Plus className="h-5 w-5" aria-hidden />
        Add exercise
      </Button>
      <Button
        type="button"
        tour={{ id: "today.finish", label: "Finish workout", help: "Finish the day and advance your program.", order: 80, when: ["populated"] }}
        className="h-11 min-w-0 flex-1 gap-2 whitespace-nowrap text-sm font-bold"
        onClick={onFinish}
        aria-label="Finish this workout"
      >
        <Flag className="h-5 w-5" aria-hidden />
        Finish
      </Button>
    </>
  );
}

/** Finished content: single disabled confirmation row. */
export function FinishedBar() {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled
      tour={{ id: "today.finished", label: "Finished", help: "This day's workout is already complete.", order: 90, when: ["populated"] }}
      className="h-11 w-full gap-2 text-sm font-bold"
    >
      <Check className="h-5 w-5" aria-hidden />
      Finished ✓
    </Button>
  );
}

/**
 * RestBar content: `Rest 1:12   −15   +15   Skip` — big tabular countdown plus
 * three ≥44px controls. The "Rest" word joins at ≥400px (the countdown + icon
 * carry the meaning on 320/360px so the row never overflows).
 */
export function RestBar({
  display,
  onAdjust,
  onSkip,
}: {
  /** Formatted countdown, e.g. "1:12". */
  display: string;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div
        {...tourAttrs({ id: "restBar.bar", label: "Rest countdown", help: "Rest countdown — tap +/− to adjust.", order: 100, hint: true, when: ["resting"] })}
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
          aria-label={`Rest timer: ${display} remaining`}
        >
          {display}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "restBar.minus15", label: "Less rest", help: "Take 15 seconds off the countdown.", order: 110, when: ["resting"] }}
        className="h-11 w-11 flex-none px-0"
        aria-label="Subtract 15 seconds"
        onClick={() => onAdjust(-15)}
      >
        <Minus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        tour={{ id: "restBar.plus15", label: "More rest", help: "Add 15 seconds to the countdown.", order: 120, when: ["resting"] }}
        className="h-11 w-11 flex-none px-0"
        aria-label="Add 15 seconds"
        onClick={() => onAdjust(15)}
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        tour={{ id: "restBar.skip", label: "Skip rest", help: "End the rest countdown immediately.", order: 130, when: ["resting"] }}
        className="h-11 flex-none gap-1 whitespace-nowrap px-3 text-sm font-bold sm:px-4"
        onClick={onSkip}
      >
        <SkipForward className="h-4 w-4" aria-hidden />
        Skip
      </Button>
    </>
  );
}
