"use client";

// SummaryRow — the 48px data-row at the end of the Today ScrollBody:
// `14 sets · 7,960 kg · 2 PRs` (sets · volume · PRs for the day, unit-aware
// label from the user's settings). Volume counts performed work only
// (completed, non-warm-up sets — same rule as the legacy header card).

import { cn } from "@/lib/utils";
import { rowTall } from "@/lib/ui/tokens";
import { totalVolume } from "@/lib/formulas";
import type { WorkoutDTO } from "@/lib/types";

export function SummaryRow({
  workout,
  unit,
  className,
}: {
  workout: WorkoutDTO;
  /** Weight unit label for the volume figure ("kg" | "lbs"). */
  unit: string;
  className?: string;
}) {
  const sets = workout.exercises.flatMap((we) => we.sets);
  const doneSets = sets.filter((s) => s.isComplete && !s.isWarmup);
  const volume = totalVolume(doneSets);
  const prs = sets.filter((s) => s.newPr).length;

  return (
    <div
      data-row
      className={cn(rowTall, "justify-center gap-2 px-1 text-sm text-muted-foreground", className)}
    >
      <span className="font-semibold tabular-nums text-foreground">
        {sets.length} {sets.length === 1 ? "set" : "sets"}
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold tabular-nums text-foreground">
        {Math.round(volume).toLocaleString()} {unit}
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold tabular-nums text-foreground">
        {prs} PR{prs === 1 ? "" : "s"}
      </span>
    </div>
  );
}
