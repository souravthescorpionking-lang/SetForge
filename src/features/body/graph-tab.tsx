"use client";

// Graph tab: records over time on a Recharts line chart with a dashed goal
// ReferenceLine, point tooltips, y-from-zero toggle, and summary stat chips.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { measurementsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayLong, round2 } from "@/lib/client/format";
import type { MeasurementDTO, MeasurementRecordDTO } from "@/lib/types";
import { localDayLabel, localDayKey, timeOf } from "./offline-mutation";
import { cn } from "@/lib/utils";
import { LineChart as LineChartIcon, Target } from "lucide-react";

type Props = {
  measurements: MeasurementDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const GOAL_COLOR = "#f59e0b";

type ChartPoint = { iso: string; label: string; value: number; day: string };

export function GraphTab({ measurements, selectedId, onSelect }: Props) {
  const [fromZero, setFromZero] = useState(false);
  const measurement = measurements.find((m) => m.id === selectedId) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: qk.measurementRecords(selectedId),
    queryFn: () => measurementsApi.records(selectedId),
    enabled: !!selectedId,
  });

  const points = useMemo<ChartPoint[]>(() => {
    const records: MeasurementRecordDTO[] = data?.records ?? [];
    return [...records]
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      .map((r) => {
        const day = localDayKey(r.recordedAt);
        return { iso: r.recordedAt, day, label: localDayLabel(day), value: r.value };
      });
  }, [data]);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    return {
      first: values[0],
      latest: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      change: values[values.length - 1] - values[0],
    };
  }, [points]);

  const unit = measurement?.unit.name ?? "";
  const hasGoal =
    !!measurement &&
    measurement.targetValue != null &&
    ["SPECIFIC", "INCREASE", "DECREASE"].includes(measurement.goalType);
  const goalValue = measurement?.targetValue ?? null;

  const fmt = (v: number) => `${round2(v)}${unit ? ` ${unit}` : ""}`;

  if (isLoading || !measurement) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 sm:p-3">
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger className="h-9 w-44 sm:w-56" aria-label="Measurement">
            <SelectValue placeholder="Pick measurement" />
          </SelectTrigger>
          <SelectContent>
            {measurements.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} ({m.unit.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {stats && (
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="numeric gap-1">
              <span className="text-muted-foreground">latest</span> {round2(stats.latest)} {unit}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "numeric gap-1",
                stats.change > 0 && "text-emerald-500",
                stats.change < 0 && "text-red-500",
              )}
            >
              <span className="text-muted-foreground">since first</span>
              {stats.change > 0 ? "+" : stats.change < 0 ? "−" : "±"}
              {round2(Math.abs(stats.change))} {unit}
            </Badge>
            <Badge variant="outline" className="numeric gap-1">
              <span className="text-muted-foreground">min</span> {round2(stats.min)}
            </Badge>
            <Badge variant="outline" className="numeric gap-1">
              <span className="text-muted-foreground">max</span> {round2(stats.max)}
            </Badge>
          </div>
        )}
        <button
          type="button"
          aria-pressed={fromZero}
          onClick={() => setFromZero((v) => !v)}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
            fromZero
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          0-Y
        </button>
      </div>

      {points.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <LineChartIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-semibold">Nothing to chart for {measurement.name} yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Log at least one entry first.</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border bg-card p-3 sm:p-4"
        >
          {hasGoal && goalValue != null && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-500">
              <Target className="h-3.5 w-3.5" />
              <span className="numeric font-semibold">
                Goal line at {round2(goalValue)} {unit}
              </span>
              <span className="text-muted-foreground">
                ({measurement.goalType.toLowerCase()})
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={56}
                domain={fromZero ? [0, "auto"] : ["auto", "auto"]}
                tickFormatter={(v: number) => round2(v)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as ChartPoint;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold">
                        {formatDayLong(p.day)} · {timeOf(p.iso)}
                      </p>
                      <p className="numeric mt-0.5 font-bold text-primary">{fmt(p.value)}</p>
                    </div>
                  );
                }}
              />
              {hasGoal && goalValue != null && (
                <ReferenceLine
                  y={goalValue}
                  stroke={GOAL_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  label={{
                    value: `Goal ${round2(goalValue)}`,
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: GOAL_COLOR,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--background)" }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {points.length} point{points.length === 1 ? "" : "s"}
            {stats ? ` · from ${round2(stats.first)} to ${round2(stats.latest)} ${unit}` : ""}
          </p>
        </motion.div>
      )}
    </div>
  );
}
