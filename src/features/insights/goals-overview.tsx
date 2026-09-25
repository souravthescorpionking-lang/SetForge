"use client";

// Goals overview — cross-exercise goal progress with sparkline-free bars.
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Trophy } from "lucide-react";
import { qk } from "@/lib/client/query";
import { goalsApi } from "@/lib/client/api";
import { goalTypeLabel, goalValueLabel, defaultUnitFor } from "@/features/exercises/labels";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import type { GoalDTO } from "@/lib/types";

export function GoalsOverview({ onOpenExercise }: { onOpenExercise: (id: string) => void }) {
  const settings = useApp((s) => s.settings);
  const unit = defaultUnitFor(settings);
  const { data, isLoading } = useQuery({
    queryKey: qk.goals,
    queryFn: () => goalsApi.list(),
  });

  const goals = data?.goals ?? [];

  return (
    <Card className="rounded-2xl border-border/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Goals</h3>
        {goals.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            <span className="font-bold text-primary numeric">
              {goals.filter((g) => g.achieved).length}
            </span>{" "}
            of <span className="numeric">{goals.length}</span> achieved
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-5/6 rounded-xl" />
        </div>
      )}

      {!isLoading && goals.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No goals set yet — open an exercise to set one.
        </p>
      )}

      <ul className="space-y-3">
        {goals.slice(0, 6).map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onOpenExercise(g.exerciseId)}
              className="w-full rounded-xl p-2 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold">
                  {g.exercise?.name ?? "Exercise"}
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                    {goalTypeLabel(g.type)}
                  </span>
                </p>
                <p className="shrink-0 text-xs font-bold numeric">
                  {goalValueLabel(g.type, g.current, unit)}
                  <span className="mx-0.5 text-muted-foreground">/</span>
                  <span className="text-primary">
                    {goalValueLabel(g.type, g.target, unit)}
                  </span>
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Progress
                  value={Math.min(100, g.pct)}
                  className={cn("h-2 flex-1", g.achieved && "*:data-[slot=progress-indicator]:bg-emerald-500")}
                />
                <span
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold numeric",
                    g.achieved
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {g.achieved && <Trophy className="h-3 w-3" />}
                  {Math.round(g.pct)}%
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
