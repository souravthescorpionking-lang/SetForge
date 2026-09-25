"use client";

// MonthStats — compact summary strip for the visible calendar month:
// total volume, training time, sets and average volume per workout.
// Computed client-side from the already-fetched month workout summaries.
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Dumbbell, Layers, TrendingUp } from "lucide-react";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { round1, round2 } from "@/lib/client/format";
import { cn } from "@/lib/utils";

/** Compact display for big numbers: 427669 → 427.7k, 1322136 → 1.32M */
function compact(n: number): string {
  if (n >= 1_000_000) return `${round2(n / 1_000_000)}M`;
  if (n >= 10_000) return `${round1(n / 1000)}k`;
  return round1(n);
}

/** Compact duration: 61440s → "17h 04m", 810s → "13:30". */
function compactDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function StatCell({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Dumbbell;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-widest text-foreground/70">{label}</p>
        <p className="truncate text-sm font-black numeric sm:text-base">{value}</p>
      </div>
    </div>
  );
}

export function MonthStats({ workouts }: { workouts: WorkoutSummaryDTO[] }) {
  const stats = useMemo(() => {
    if (workouts.length === 0) return null;
    const volume = workouts.reduce((a, w) => a + w.volume, 0);
    const duration = workouts.reduce((a, w) => a + w.durationSec, 0);
    const sets = workouts.reduce((a, w) => a + w.setCount, 0);
    return {
      volume,
      duration,
      sets,
      avg: volume / workouts.length,
    };
  }, [workouts]);

  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="grid grid-cols-2 divide-border/60 rounded-2xl border bg-card sm:grid-cols-4 sm:divide-x"
      aria-label="Month totals"
    >
      <StatCell icon={Dumbbell} label="Volume" value={`${compact(stats.volume)} kg`} accent />
      <StatCell icon={Clock} label="Time" value={compactDuration(stats.duration)} />
      <StatCell icon={Layers} label="Sets" value={String(stats.sets)} />
      <StatCell icon={TrendingUp} label="Avg / workout" value={`${compact(stats.avg)} kg`} />
    </motion.div>
  );
}
