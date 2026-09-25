"use client";

// Graph tab: metric selector (+ reps / RM selectors where applicable) and the
// shared TrendChart. Initial metric respects the exercise's defaultGraph.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendChart } from "@/components/shared/trend-chart";
import { exercisesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDuration, formatPace } from "@/lib/formulas";
import { GRAPH_METRICS, type GraphMetric } from "@/lib/constants";
import type { ExerciseDTO } from "@/lib/types";

const METRIC_LABELS: Record<GraphMetric, string> = {
  EST_1RM: "Est. 1RM",
  MAX_WEIGHT: "Max weight",
  VOLUME: "Volume",
  TOTAL_REPS: "Total reps",
  MAX_REPS: "Max reps",
  WEIGHT_FOR_REPS: "Weight for reps",
  REP_MAXES: "Rep maxes",
  MAX_DISTANCE: "Max distance",
  MAX_TIME: "Max time",
  MAX_SPEED: "Max speed",
  MAX_PACE: "Best pace",
  AVG_REST: "Avg rest",
};

function fmtMetric(metric: string, v: number): string {
  switch (metric) {
    case "VOLUME":
      return `${Math.round(v).toLocaleString()}kg`;
    case "EST_1RM":
    case "MAX_WEIGHT":
    case "WEIGHT_FOR_REPS":
    case "REP_MAXES":
      return `${Math.round(v * 10) / 10}kg`;
    case "TOTAL_REPS":
    case "MAX_REPS":
      return String(Math.round(v));
    case "MAX_DISTANCE":
      return `${Math.round(v * 100) / 100}km`;
    case "MAX_TIME":
      return formatDuration(v);
    case "MAX_SPEED":
      return `${Math.round(v * 10) / 10}km/h`;
    case "MAX_PACE":
      return `${formatPace(v)}/km`;
    default:
      return String(Math.round(v * 100) / 100);
  }
}

export function GraphTab({ exercise }: { exercise: ExerciseDTO }) {
  const initial = (GRAPH_METRICS as readonly string[]).includes(exercise.defaultGraph ?? "")
    ? (exercise.defaultGraph as GraphMetric)
    : "EST_1RM";
  const [metric, setMetric] = useState<GraphMetric>(initial);
  const [reps, setReps] = useState<number>(5);
  const [rm, setRm] = useState<number>(5);

  const records = useQuery({
    queryKey: qk.exerciseRecords(exercise.id),
    queryFn: () => exercisesApi.records(exercise.id),
    staleTime: 60_000,
  });

  const repsOptions = useMemo(() => {
    const fromRecords = (records.data?.actual ?? []).map((r) => r.reps).filter((r) => r > 0);
    const set = new Set<number>(fromRecords.length ? fromRecords : [1, 3, 5, 8, 10, 12]);
    if (!set.has(reps)) set.add(reps);
    return [...set].sort((a, b) => a - b);
  }, [records.data, reps]);

  const params = useMemo(
    () => ({
      metric,
      ...(metric === "WEIGHT_FOR_REPS" ? { reps } : {}),
      ...(metric === "REP_MAXES" ? { rm } : {}),
    }),
    [metric, reps, rm],
  );

  const graph = useQuery({
    queryKey: qk.exerciseGraph(exercise.id, params),
    queryFn: () => exercisesApi.graph(exercise.id, params),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={metric} onValueChange={(v) => setMetric(v as GraphMetric)}>
          <SelectTrigger className="h-10 min-w-40 rounded-xl text-sm font-semibold" aria-label="Graph metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRAPH_METRICS.map((m) => (
              <SelectItem key={m} value={m}>
                {METRIC_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {metric === "WEIGHT_FOR_REPS" && (
          <Select value={String(reps)} onValueChange={(v) => setReps(Number(v))}>
            <SelectTrigger className="h-10 w-28 rounded-xl text-sm" aria-label="Reps">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {repsOptions.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r} reps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {metric === "REP_MAXES" && (
          <Select value={String(rm)} onValueChange={(v) => setRm(Number(v))}>
            <SelectTrigger className="h-10 w-32 rounded-xl text-sm" aria-label="Repetition maximum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r} RM
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-3 pb-1">
        {graph.isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : graph.isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">Could not load graph</div>
        ) : (
          <TrendChart
            points={graph.data?.points ?? []}
            height={264}
            valueFormatter={(v) => fmtMetric(metric, v)}
          />
        )}
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">
        {graph.data?.points.length ?? 0} data point{(graph.data?.points.length ?? 0) === 1 ? "" : "s"} · {METRIC_LABELS[metric]}
      </p>
    </div>
  );
}
