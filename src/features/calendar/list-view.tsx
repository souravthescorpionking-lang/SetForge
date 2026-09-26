"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ListView — the calendar's List page (p3-6).
//
//   month group headers : 32px (h-8), muted, single-line — NOT data-rows
//   workout rows        : 56px data-rows, single-line:
//                           date (96px fixed, tabular) | exercise names joined
//                           "·" ellipsized (flex-1) | set count (40px right)
//
// Exercise names come from the shared byDate query cache (the legacy
// WorkoutList "names" display-mode pattern) with the workout's category names
// as an instant fallback. VIRTUALISATION SKIPPED by design: 48 demo rows ×
// single-line 56px render and scroll smoothly — noted in the p3-6 report.
// Tap a row → the caller selects that day + switches to Month view.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkoutByDate } from "@/lib/client/query";
import { dayKeyOf, formatDayLabel } from "@/lib/client/format";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { monthOf, monthLabelLong } from "./month-utils";

type Props = {
  workouts: WorkoutSummaryDTO[];
  loading: boolean;
  onPick: (dayKey: string) => void;
};

type MonthGroup = { key: string; label: string; workouts: WorkoutSummaryDTO[] };

function groupByMonth(workouts: WorkoutSummaryDTO[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();
  for (const w of workouts) {
    const dayKey = dayKeyOf(w.date);
    const anchor = monthOf(dayKey);
    const key = `${anchor.year}-${String(anchor.month + 1).padStart(2, "0")}`;
    let g = index.get(key);
    if (!g) {
      g = { key, label: monthLabelLong(anchor), workouts: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.workouts.push(w);
  }
  return groups;
}

export function ListView({ workouts, loading, onPick }: Props) {
  const groups = useMemo(() => groupByMonth(workouts), [workouts]);

  if (loading && workouts.length === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading workouts">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
        <p className="text-sm font-semibold">No workouts match</p>
        <p className="mt-1 text-sm text-muted-foreground">Log a workout or loosen the filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2" aria-label={g.label}>
          {/* month group header — 32px, not a data-row */}
          <h2 className="flex h-8 items-center gap-2 overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex-none truncate">{g.label}</span>
            <span className="flex-none tabular-nums">· {g.workouts.length}</span>
            <span className="h-px min-w-0 flex-1 bg-border/60" aria-hidden />
          </h2>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
            {g.workouts.map((w) => (
              <ListRow key={w.id} workout={w} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ListRow({ workout, onPick }: { workout: WorkoutSummaryDTO; onPick: (dayKey: string) => void }) {
  const dayKey = dayKeyOf(workout.date);
  // shared byDate cache — the exercise names appear once the day is fetched
  const { data } = useWorkoutByDate(dayKey);
  const names = data?.workout?.exercises
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((we) => we.exercise.name);
  const fallback = workout.categories.map((c) => c.name).join(" · ");

  return (
    <button
      type="button"
      data-row
      onClick={() => onPick(dayKey)}
      aria-label={`${formatDayLabel(dayKey)} — ${workout.setCount} sets`}
      className="flex h-14 w-full items-center gap-3 overflow-hidden whitespace-nowrap px-3 text-left transition-colors hover:bg-accent/50 sm:px-4"
    >
      <span className="w-24 flex-none truncate text-sm font-semibold tabular-nums">
        {formatDayLabel(dayKey)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {names && names.length > 0 ? names.join(" · ") : fallback || "Workout"}
      </span>
      <span className="w-10 flex-none text-right text-sm tabular-nums text-muted-foreground">
        {workout.setCount}
      </span>
    </button>
  );
}
