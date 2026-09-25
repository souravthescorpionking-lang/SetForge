"use client";

// Goal-aware value/delta display for measurements.
// INCREASE → up=good(green)/down=bad(red); DECREASE → inverse;
// SPECIFIC → distance to target; NONE → neutral.

import { ArrowDown, ArrowUp, Minus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { round2 } from "@/lib/client/format";
import { signedDelta } from "./offline-mutation";

type Props = {
  goalType: string;
  last: number | null;
  prev: number | null;
  target: number | null;
  unit: string;
  className?: string;
};

export function DeltaChip({ goalType, last, prev, target, unit, className }: Props) {
  if (last == null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        <Minus className="mr-0.5 inline h-3 w-3" />
        no data
      </span>
    );
  }

  if (goalType === "SPECIFIC" && target != null) {
    const diff = Math.round((last - target) * 100) / 100;
    if (Math.abs(diff) < 0.005) {
      return (
        <span className={cn("numeric text-xs font-semibold text-emerald-500", className)}>
          <Target className="mr-0.5 inline h-3 w-3" /> at target
        </span>
      );
    }
    return (
      <span className={cn("numeric text-xs font-semibold text-amber-500", className)}>
        <Target className="mr-0.5 inline h-3 w-3" /> {round2(Math.abs(diff))} {unit} to target
      </span>
    );
  }

  if (prev == null) {
    return (
      <span className={cn("numeric text-xs text-muted-foreground", className)}>first entry</span>
    );
  }

  const delta = Math.round((last - prev) * 100) / 100;
  const flat = Math.abs(delta) < 0.005;
  const up = delta > 0;

  let good: boolean | null = null;
  if (goalType === "INCREASE") good = up;
  else if (goalType === "DECREASE") good = !up;

  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "numeric inline-flex items-center gap-0.5 text-xs font-semibold",
        flat
          ? "text-muted-foreground"
          : good === null
            ? "text-muted-foreground"
            : good
              ? "text-emerald-500"
              : "text-red-500",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {flat ? "no change" : `${signedDelta(delta)} ${unit}`}
    </span>
  );
}

/** Compact goal description chip (target display). */
export function GoalBadge({ goalType, target, unit }: { goalType: string; target: number | null; unit: string }) {
  if (target != null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
        <Target className="h-3 w-3" />
        <span className="numeric">
          {round2(target)} {unit}
        </span>
      </span>
    );
  }
  if (goalType === "INCREASE" || goalType === "DECREASE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        {goalType === "INCREASE" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        aim {goalType.toLowerCase()}
      </span>
    );
  }
  return null;
}
