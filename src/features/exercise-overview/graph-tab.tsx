"use client";

// Graph tab: metric select (type-aware), conditional reps/RM inputs,
// optional date range, shared TrendChart, "set as default graph".
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/shared/stepper";
import { TrendChart } from "@/components/shared/trend-chart";
import { qk, useInvalidate } from "@/lib/client/query";
import { exercisesApi } from "@/lib/client/api";
import { formatDayShort } from "@/lib/client/format";
import type { ExerciseDTO } from "@/lib/types";
import { BookmarkCheck, BookmarkPlus, Calendar as CalendarIcon, LineChart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WeightUnit,
  fallbackMetricForType,
  graphMetricLabel,
  metricValueFormatter,
  metricsForType,
} from "@/features/exercises/labels";
import { useOfflineRun } from "@/features/exercises/offline-run";

// day keys ↔ local Date for react-day-picker (avoids UTC off-by-one)
function keyToLocal(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function localToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GraphTab({ exercise, unit }: { exercise: ExerciseDTO; unit: WeightUnit }) {
  const invalidate = useInvalidate();
  const run = useOfflineRun();
  const allowed = useMemo(() => metricsForType(exercise.type), [exercise.type]);
  const initialMetric =
    exercise.defaultGraph && allowed.includes(exercise.defaultGraph)
      ? exercise.defaultGraph
      : fallbackMetricForType(exercise.type);

  const [chosenMetric, setChosenMetric] = useState<string | null>(null);
  const [reps, setReps] = useState(5);
  const [rm, setRm] = useState(1);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  // derived: fall back to the exercise default (or type fallback) whenever the
  // chosen metric is unset or no longer valid for the exercise type
  const metric =
    chosenMetric && allowed.includes(chosenMetric) ? chosenMetric : initialMetric;
  const setMetric = (m: string) => setChosenMetric(m);

  const params = useMemo(
    () => ({
      metric,
      ...(metric === "WEIGHT_FOR_REPS" ? { reps } : {}),
      ...(metric === "REP_MAXES" ? { rm } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [metric, reps, rm, from, to],
  );

  const { data, isLoading } = useQuery({
    queryKey: qk.exerciseGraph(exercise.id, params),
    queryFn: () => exercisesApi.graph(exercise.id, params),
  });

  const isDefault = exercise.defaultGraph === metric;
  const fmt = useMemo(() => metricValueFormatter(metric, unit), [metric, unit]);

  const saveAsDefault = async () => {
    await run({
      label: "Default graph",
      path: `/api/exercises/${exercise.id}`,
      method: "PATCH",
      body: { defaultGraph: metric },
      run: () => exercisesApi.update(exercise.id, { defaultGraph: metric }),
      successMsg: `${graphMetricLabel(metric)} set as default graph`,
      onDone: () => invalidate.exercises(),
    });
  };

  const points = data?.points ?? [];

  return (
    <Card className="gap-4 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger className="h-9 w-[190px] rounded-lg" aria-label="Graph metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((m) => (
                <SelectItem key={m} value={m}>
                  {graphMetricLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {metric === "WEIGHT_FOR_REPS" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">at</span>
              <Stepper
                value={reps}
                onChange={(v) => setReps(v ?? 5)}
                min={1}
                max={15}
                step={1}
                decimals={0}
                suffix="reps"
                size="sm"
                className="w-28"
                ariaLabel="reps"
              />
            </div>
          )}

          {metric === "REP_MAXES" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">for</span>
              <Stepper
                value={rm}
                onChange={(v) => setRm(v ?? 1)}
                min={1}
                max={15}
                step={1}
                decimals={0}
                suffix="RM"
                size="sm"
                className="w-24"
                ariaLabel="rep max"
              />
            </div>
          )}
        </div>

        <Button
          variant={isDefault ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => void saveAsDefault()}
          disabled={isDefault}
        >
          {isDefault ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
          {isDefault ? "Default graph" : "Set as default"}
        </Button>
      </div>

      {/* date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
              <CalendarIcon className="h-3.5 w-3.5" />
              {from ? formatDayShort(from) : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={from ? keyToLocal(from) : undefined}
              onSelect={(d) => {
                if (!d) return setFrom(null);
                const key = localToKey(d);
                setFrom(key);
                if (to && key > to) setTo(null);
              }}
            />
          </PopoverContent>
        </Popover>

        <span className="text-xs text-muted-foreground">to</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
              <CalendarIcon className="h-3.5 w-3.5" />
              {to ? formatDayShort(to) : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={to ? keyToLocal(to) : undefined}
              onSelect={(d) => {
                if (!d) return setTo(null);
                const key = localToKey(d);
                setTo(key);
                if (from && key < from) setFrom(null);
              }}
            />
          </PopoverContent>
        </Popover>

        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1 px-2 text-xs"
            onClick={() => {
              setFrom(null);
              setTo(null);
            }}
          >
            <X className="h-3 w-3" /> All time
          </Button>
        )}
        {!from && !to && <span className="text-xs text-muted-foreground">All time</span>}
      </div>

      <div className="mt-1">
        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : points.length === 0 ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
            <LineChart className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No data for {graphMetricLabel(metric)} yet</p>
            <p className="text-xs text-muted-foreground/70">Log a few sessions to chart your progress.</p>
          </div>
        ) : (
          <TrendChart
            points={points}
            height={280}
            valueFormatter={fmt}
            defaultFromZero={metric === "VOLUME"}
          />
        )}
      </div>

      <p className={cn("text-xs text-muted-foreground numeric", isLoading && "opacity-50")}>
        {points.length} data point{points.length === 1 ? "" : "s"}
        {from || to
          ? ` · ${from ? formatDayShort(from) : "start"} → ${to ? formatDayShort(to) : "now"}`
          : " · all time"}
      </p>
    </Card>
  );
}
