"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RecordsMonthRow — the 48px "Records this month" row (Part 8 §3.2).
//
//   Bench 100×5 · Deadlift 160×3                          >
//
// The top 2 PRs of the current month (heaviest best set per exercise,
// `recordsApi.all()` filtered to bestWeightDate within the month). Empty →
// "No records yet". Tap → #/insights (Records tab).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk } from "@/lib/client/query";
import { recordsApi } from "@/lib/client/api";
import { round1 } from "@/lib/client/format";

export function RecordsMonthRow({ monthKey }: { monthKey: string }) {
  const navigate = useApp((s) => s.navigate);
  const { data, isLoading } = useQuery({ queryKey: qk.records, queryFn: () => recordsApi.all() });

  const text = useMemo(() => {
    const rows = (data?.records ?? [])
      .filter((r) => r.bestWeight != null && !!r.bestWeightDate?.startsWith(monthKey))
      .sort((a, b) => (b.bestWeight ?? 0) - (a.bestWeight ?? 0))
      .slice(0, 2);
    return rows
      .map((r) => `${r.exerciseName} ${round1(r.bestWeight ?? 0)}×${r.bestWeightReps ?? "–"}`)
      .join(" · ");
  }, [data, monthKey]);

  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-lg" aria-busy="true" aria-hidden />;
  }

  return (
    <button
      type="button"
      data-row
      {...tourAttrs({
        id: "dashboard.records",
        label: "Monthly records",
        help: "Your top personal records set this month. Tap for the full leaderboard.",
        order: 50,
      })}
      onClick={() => navigate("/insights")}
      aria-label={text ? `Records this month: ${text}` : "No records yet this month"}
      className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40"
    >
      {text ? (
        <span className="min-w-0 flex-1 truncate text-sm tabular-nums">{text}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">No records yet</span>
      )}
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
    </button>
  );
}
