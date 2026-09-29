"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RestRingBlock — §4.11 restDisplay="RING": while a rest countdown runs, a
// 200px block is inserted as the FIRST child of the ScrollBody — a TickedRing
// (60 ticks, mm:ss centre label) with a 40px `-15 +15 Skip` control row
// beneath. It is a NORMAL flow element: content below is pushed down, no
// overlay, and the block is removed when rest ends. The 56px RestBar stays in
// the BottomBar (RING is additive to BAR).
// Copied from features/today/rest-ring-block.tsx for the Part 8 session screen.
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import { Minus, Plus, SkipForward } from "lucide-react";
import { TickedRing } from "@/components/shared/progress-ring";
import { formatDuration } from "@/lib/formulas";

export function RestRingBlock({
  remainingSec,
  totalSec,
  onAdjust,
  onSkip,
}: {
  /** Live remaining seconds of the countdown (label + tick fraction). */
  remainingSec: number;
  /** Total seconds the countdown was started with (null → empty ring). */
  totalSec: number | null;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}) {
  const fraction = totalSec && totalSec > 0 ? remainingSec / totalSec : 0;
  const display = formatDuration(remainingSec);
  return (
    <section
      className="flex h-[200px] w-full flex-none flex-col items-center justify-center rounded-lg border bg-card "
      aria-label={`Rest countdown ring: ${display} remaining`}
    >
      <TickedRing fraction={fraction} size={160} label={display} />
      <div className="flex h-10 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          {...tourAttrs({ skipTour: true, reason: "-15s button inside the rest ring block" })}
          className="h-10 w-10 flex-none px-0"
          aria-label="Subtract 15 seconds"
          onClick={() => onAdjust(-15)}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          {...tourAttrs({ skipTour: true, reason: "+15s button inside the rest ring block" })}
          className="h-10 w-10 flex-none px-0"
          aria-label="Add 15 seconds"
          onClick={() => onAdjust(15)}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          {...tourAttrs({ skipTour: true, reason: "Skip button inside the rest ring block" })}
          className="h-10 flex-none gap-1 whitespace-nowrap px-3 text-sm font-bold"
          onClick={onSkip}
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          Skip
        </Button>
      </div>
    </section>
  );
}
