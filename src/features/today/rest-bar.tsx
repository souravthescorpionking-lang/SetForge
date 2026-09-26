"use client";

// BottomBar contents for the Today screen. The BottomBar CONTAINER is always
// the same 56px primitive — its CONTENT swaps between the add button and the
// RestBar while a rest countdown runs (never both, never stacked).

import { Button } from "@/components/ui/button";
import { Minus, Plus, SkipForward, Timer } from "lucide-react";

/** Default content: full-width "+ Add exercise". */
export function AddExerciseBar({ onAdd }: { onAdd: () => void }) {
  return (
    <Button
      type="button"
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
      <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
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
        className="h-11 w-11 flex-none px-0"
        aria-label="Subtract 15 seconds"
        onClick={() => onAdjust(-15)}
      >
        <Minus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-11 flex-none px-0"
        aria-label="Add 15 seconds"
        onClick={() => onAdjust(15)}
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        className="h-11 flex-none gap-1 whitespace-nowrap px-3 text-sm font-bold sm:px-4"
        onClick={onSkip}
      >
        <SkipForward className="h-4 w-4" aria-hidden />
        Skip
      </Button>
    </>
  );
}
