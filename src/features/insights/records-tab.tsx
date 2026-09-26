"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RecordsTab — RECORDS tab of #/insights (Part 3 p3-7).
//
//   Segmented control 40px [data-row]: Estimated | Actual (updates ?scope=)
//   Table of 40px [data-row]s: rank 20px | category dot | Exercise (flex,
//   ellipsis) | value 72px right tabular | date 88px.
// Estimated scope shows the e1RM (Brzycki) per exercise; Actual shows the best
// real set (weight × reps). Data/logic ported from legacy records-leaderboard
// + exercise-overview/records-tab. Rows deep-link to #/exercise-overview/{id}.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDot } from "@/components/shared/category-dot";
import { Trophy } from "lucide-react";
import { recordsApi, type AllRecordsRow } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { useApp } from "@/lib/client/store";
import { formatDayShort, round1 } from "@/lib/client/format";
import { cn } from "@/lib/utils";

export type RecordsScope = "estimated" | "actual";

const SCOPES: Array<{ value: RecordsScope; label: string }> = [
  { value: "estimated", label: "Estimated" },
  { value: "actual", label: "Actual" },
];

export function RecordsTab({
  scope,
  onScopeChange,
}: {
  scope: RecordsScope;
  onScopeChange: (s: RecordsScope) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const { data, isLoading } = useQuery({ queryKey: qk.records, queryFn: () => recordsApi.all() });
  const records = data?.records ?? [];

  const sorted = useMemo<AllRecordsRow[]>(() => {
    const rows = [...records];
    if (scope === "actual") {
      rows.sort((a, b) => (b.bestWeight ?? -1) - (a.bestWeight ?? -1));
    } else {
      rows.sort((a, b) => (b.estimatedOneRm ?? -1) - (a.estimatedOneRm ?? -1));
    }
    return rows;
  }, [records, scope]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Segmented control — 40px data-row (Estimated | Actual) */}
      <div
        data-row
        className="grid h-10 w-full grid-cols-2 overflow-hidden whitespace-nowrap rounded-lg border"
        role="group"
        aria-label="Record scope"
      >
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={scope === s.value}
            onClick={() => onScopeChange(s.value)}
            className={cn(
              "h-full min-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-colors",
              scope === s.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* column hint — 32px section header (not a data-row) */}
      <p className="flex h-8 flex-none items-center overflow-hidden px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {scope === "estimated" ? "Estimated 1RM · kg" : "Best set · kg"}
      </p>

      {sorted.length === 0 ? (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
        >
          No records yet — log sets to start breaking them.
        </div>
      ) : (
        sorted.map((r, i) => {
          const value = scope === "estimated" ? r.estimatedOneRm : r.bestWeight;
          const hasValue = value != null;
          const date = r.bestWeightDate ? formatDayShort(r.bestWeightDate.slice(0, 10)) : null;
          return (
            <button
              key={r.exerciseId}
              type="button"
              data-row
              onClick={() => navigate(`/exercise-overview/${r.exerciseId}`)}
              aria-label={`${r.exerciseName} records`}
              className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50 text-left transition-colors hover:bg-accent/50"
            >
              <span
                className={cn(
                  "w-5 flex-none text-right text-[11px] font-black tabular-nums",
                  i === 0 && hasValue ? "text-primary" : "text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              {r.categoryColour ? (
                <CategoryDot colour={r.categoryColour} className="h-2.5 w-2.5 flex-none" />
              ) : null}
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="min-w-0 truncate text-sm font-medium">{r.exerciseName}</span>
                {scope === "estimated" && i === 0 && hasValue ? (
                  <Trophy className="h-3.5 w-3.5 flex-none text-primary" aria-label="Top estimated 1RM" />
                ) : null}
              </span>
              <span className="w-[72px] flex-none truncate text-right text-sm font-bold tabular-nums">
                {hasValue ? round1(value as number) : "–"}
                {scope === "actual" && hasValue && r.bestWeightReps != null ? (
                  <span className="text-[10px] font-medium text-muted-foreground">×{r.bestWeightReps}</span>
                ) : null}
              </span>
              <span className="w-[88px] flex-none truncate text-right text-xs text-muted-foreground">
                {date ?? "–"}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
