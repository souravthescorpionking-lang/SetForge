"use client";

// TodayEmpty — the single 200px empty-state block for days with no workout:
// headline + two 48px data-row buttons (Start New Workout / Copy Previous
// Workout, reusing the legacy creation/copy logic passed in as callbacks).
// NOTHING else renders in the ScrollBody on empty days (no MetaRow/SummaryRow).

import { Button } from "@/components/ui/button";
import { Dumbbell, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function TodayEmpty({
  hasPrevious,
  starting,
  onStartNew,
  onCopyPrevious,
  className,
}: {
  /** Whether any workout exists before this date (enables Copy Previous). */
  hasPrevious: boolean;
  starting?: boolean;
  onStartNew: () => void;
  onCopyPrevious: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="No workout this day"
      className={cn(
        "flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold">No workout this day</p>
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        <Button
          type="button"
          data-row
          className="h-12 w-full gap-2 whitespace-nowrap text-sm font-bold"
          onClick={onStartNew}
          disabled={starting}
        >
          <Flame className="h-4 w-4" aria-hidden />
          {starting ? "Starting…" : "Start New Workout"}
        </Button>
        <Button
          type="button"
          data-row
          variant="outline"
          className="h-12 w-full gap-2 whitespace-nowrap text-sm font-semibold"
          onClick={onCopyPrevious}
          disabled={!hasPrevious || starting}
        >
          <Dumbbell className="h-4 w-4" aria-hidden />
          Copy Previous Workout
        </Button>
      </div>
    </div>
  );
}
