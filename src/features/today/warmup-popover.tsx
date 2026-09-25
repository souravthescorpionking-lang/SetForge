"use client";

// Warm-up set generator: computes a ramp from the target working weight
// (empty bar → 40% ×8 → 60% ×5 → 80% ×3) and logs each set in one tap.
// With `autoOpen` (per-exercise setting) the ramp opens by itself the first
// time a target weight is available — the caller gates it per exercise entry.
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FlameKindling, Plus } from "lucide-react";
import { roundToStep } from "@/lib/formulas";
import { cn } from "@/lib/utils";

export type WarmupStep = {
  /** Fraction of the working weight (0 = empty bar). */
  pct: number;
  reps: number;
  weight: number;
  label: string;
};

/** Classic 4-step ramp; the empty-bar step only appears for heavier targets. */
export function buildWarmup(target: number, step: number): WarmupStep[] {
  const steps: WarmupStep[] = [];
  if (target >= 40) {
    steps.push({ pct: 0, reps: 10, weight: 20, label: "Empty bar" });
  }
  const plan: Array<[number, number]> = [
    [0.4, 8],
    [0.6, 5],
    [0.8, 3],
  ];
  for (const [pct, reps] of plan) {
    const w = roundToStep(target * pct, step);
    if (w >= (target >= 40 ? 22.5 : 2.5)) {
      steps.push({ pct, reps, weight: w, label: `${Math.round(pct * 100)}%` });
    }
  }
  return steps;
}

export function WarmupPopover({
  targetWeight,
  step,
  onLog,
  disabled,
  autoOpen,
  onAutoOpened,
}: {
  targetWeight: number;
  step: number;
  onLog: (weight: number, reps: number) => Promise<void>;
  disabled?: boolean;
  /** Open the ramp automatically (fires at most once per mount via onAutoOpened). */
  autoOpen?: boolean;
  /** Called when the auto-open fired — lets the parent stop re-opening. */
  onAutoOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loggingIdx, setLoggingIdx] = useState<number | null>(null);
  const autoFiredRef = useRef(false);

  const steps = targetWeight > 0 ? buildWarmup(targetWeight, step) : [];

  // auto-open once when a target weight first becomes available
  useEffect(() => {
    if (!autoOpen || autoFiredRef.current || steps.length === 0) return;
    autoFiredRef.current = true;
    onAutoOpened?.();
    setOpen(true);
  }, [autoOpen, steps.length, onAutoOpened]);

  const log = async (i: number, w: number, reps: number) => {
    setLoggingIdx(i);
    try {
      await onLog(w, reps);
    } finally {
      setLoggingIdx(null);
    }
  };

  if (steps.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="lg"
          variant="outline"
          className="h-13 shrink-0 rounded-xl px-4"
          disabled={disabled}
          aria-label="Generate warm-up sets"
        >
          <FlameKindling className="h-5 w-5 text-amber-500" />
          <span className="ml-1.5 hidden sm:inline">Warm-up</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Warm-up ramp · target{" "}
          <span className="numeric text-foreground">{targetWeight}kg</span>
        </p>
        <div className="mt-2 space-y-1.5">
          {steps.map((s, i) => (
            <button
              key={`${s.pct}-${s.weight}`}
              type="button"
              onClick={() => void log(i, s.weight, s.reps)}
              disabled={loggingIdx !== null}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
                "hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] disabled:opacity-60",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-12 shrink-0 items-center justify-center rounded-lg text-xs font-black numeric",
                    s.pct === 0 ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {s.pct === 0 ? "∅" : `${Math.round(s.pct * 100)}%`}
                </span>
                <span>
                  <span className="block text-sm font-bold">
                    <span className="numeric">{s.weight}</span>kg × <span className="numeric">{s.reps}</span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{s.label}</span>
                </span>
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
                {loggingIdx === i ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Tapping a step logs it as a set — work through the ramp, then hit your top weight.
        </p>
      </PopoverContent>
    </Popover>
  );
}
