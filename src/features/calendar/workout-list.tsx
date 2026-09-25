"use client";

// List view: all workouts newest-first, grouped under month headings.
// Row display mode: dots (category colours) | names (exercises) | sets (counts).

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import { useWorkoutByDate } from "@/lib/client/query";
import { dayKeyOf, formatDayLabel, round1 } from "@/lib/client/format";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { groupByMonth } from "./filter-state";
import { cn } from "@/lib/utils";
import { ChevronRight, Dumbbell } from "lucide-react";

export type DisplayMode = "dots" | "names" | "sets";

type Props = {
  workouts: WorkoutSummaryDTO[];
  loading: boolean;
  displayMode: DisplayMode;
  onPick: (dayKey: string) => void;
};

export function WorkoutList({ workouts, loading, displayMode, onPick }: Props) {
  const groups = useMemo(() => groupByMonth(workouts), [workouts]);

  if (loading && workouts.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
        <Dumbbell className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-semibold">No workouts match</p>
        <p className="mt-1 text-sm text-muted-foreground">Log a workout or loosen the filters.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-19rem)] min-h-72 overflow-y-auto scroll-slim pr-1">
      {groups.map((g) => (
        <section key={g.key} className="mb-4">
          <h3 className="sticky top-0 z-10 -mx-1 mb-1.5 bg-background/95 px-1 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            {g.label}
            <span className="numeric ml-1.5 font-semibold normal-case">
              · {g.workouts.length}
            </span>
          </h3>
          <ul className="space-y-1.5">
            {g.workouts.map((w, i) => (
              <motion.li
                key={w.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(i, 8) * 0.02 }}
              >
                <button
                  type="button"
                  onClick={() => onPick(dayKeyOf(w.date))}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 sm:px-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{formatDayLabel(dayKeyOf(w.date))}</span>
                      <span className="numeric text-xs text-muted-foreground">
                        {w.setCount} sets
                        {w.volume > 0 ? ` · ${round1(w.volume)} kg` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 min-h-5">
                      {displayMode === "dots" && <CategoryDots w={w} />}
                      {displayMode === "names" && <ExerciseNames dayKey={dayKeyOf(w.date)} />}
                      {displayMode === "sets" && (
                        <p className="numeric truncate text-xs text-muted-foreground">
                          {w.exerciseCount} exercise{w.exerciseCount === 1 ? "" : "s"} · {w.setCount} set
                          {w.setCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                    {w.comment && displayMode !== "names" && (
                      <p className="mt-1 truncate text-xs italic text-muted-foreground">{w.comment}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CategoryDots({ w }: { w: WorkoutSummaryDTO }) {
  return (
    <span className="flex items-center gap-1.5">
      {w.categories.map((c) => (
        <span key={c.name} title={c.name} className="flex items-center gap-1">
          <CategoryDot colour={c.colour} size={8} ring={false} />
          <span className="hidden text-xs text-muted-foreground sm:inline">{c.name}</span>
        </span>
      ))}
      {w.categories.length > 0 && (
        <Badge variant="outline" className="numeric ml-1 h-5 px-1.5 text-[10px]">
          {w.exerciseCount} ex
        </Badge>
      )}
    </span>
  );
}

/** Lazily fetches the workout for names mode (uses the shared byDate cache). */
function ExerciseNames({ dayKey }: { dayKey: string }) {
  const { data, isLoading } = useWorkoutByDate(dayKey);
  if (isLoading && !data) {
    return <span className="block h-4 w-40 animate-pulse rounded bg-muted" />;
  }
  const names = data?.workout?.exercises.map((we) => we.exercise.name) ?? [];
  if (names.length === 0) {
    return <span className="text-xs text-muted-foreground">No exercises</span>;
  }
  return (
    <p className="truncate text-xs text-muted-foreground">
      {names.map((n, i) => (
        <span key={n}>
          <span className={cn(i === 0 && "font-medium text-foreground/90")}>{n}</span>
          {i < names.length - 1 && <span className="mx-0.5 text-muted-foreground/60">·</span>}
        </span>
      ))}
    </p>
  );
}
