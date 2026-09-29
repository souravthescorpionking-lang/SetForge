"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyGraphTab — GRAPH tab of #/body (Part 3 p3-7). Same rules as the Training
// Graph tab:
//
//   ControlRow 48px [data-row] : measurement select | range select | ⋮ options
//   Chart box                  : fixed 240px mobile / 360px desktop (svg inside)
//   DetailRow 72px [data-row]  : always reserved, "–" when no point selected
//
// Chart logic ported from legacy graph-tab.tsx (records over time, dashed goal
// ReferenceLine for SPECIFIC targets, y-from-zero toggle) + the training
// screen's trend-line / tooltip-selection pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreVertical } from "lucide-react";
import { measurementsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayShort, round2 } from "@/lib/client/format";
import { rowHero } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import type { MeasurementDTO } from "@/lib/types";
import { localDayKey } from "./body-util";

const RANGE_OPTIONS = [
  { value: "3M", label: "3M", days: 90 },
  { value: "6M", label: "6M", days: 180 },
  { value: "ALL", label: "All", days: null },
] as const;
type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

const GOAL_COLOR = "#f59e0b";

type GraphPoint = {
  iso: string;
  day: string;
  label: string;
  value: number;
  prev: number | null;
  next: number | null;
  trend?: number;
};

export function BodyGraphTab({ measurements }: { measurements: MeasurementDTO[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [range, setRange] = useState<RangeValue>("ALL");
  const [showPoints, setShowPoints] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [fromZero, setFromZero] = useState(false);
  const [selected, setSelected] = useState<GraphPoint | null>(null);
  const onSelectPoint = useCallback((p: GraphPoint | null) => setSelected(p), []);

  // selection falls back to the default measurement until the user picks one
  const effectiveId = useMemo(() => {
    if (selectedId && measurements.some((m) => m.id === selectedId)) return selectedId;
    return (
      measurements.find((m) => m.isDefault && m.isEnabled)?.id ??
      measurements.find((m) => m.isEnabled)?.id ??
      measurements[0]?.id ??
      ""
    );
  }, [selectedId, measurements]);
  const measurement = measurements.find((m) => m.id === effectiveId) ?? null;
  const unit = measurement?.unit.name ?? "";

  const recordsQuery = useQuery({
    queryKey: qk.measurementRecords(effectiveId),
    queryFn: () => measurementsApi.records(effectiveId),
    enabled: !!effectiveId,
  });

  const points = useMemo<GraphPoint[]>(() => {
    const records = [...(recordsQuery.data?.records ?? [])].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt),
    );
    const rangeDays = RANGE_OPTIONS.find((r) => r.value === range)?.days ?? null;
    const cutoff = rangeDays ? Date.now() - rangeDays * 86_400_000 : null;
    return records
      .filter((r) => cutoff == null || new Date(r.recordedAt).getTime() >= cutoff)
      .map((r, i, arr) => ({
        iso: r.recordedAt,
        day: localDayKey(r.recordedAt),
        label: formatDayShort(localDayKey(r.recordedAt)),
        value: r.value,
        prev: i > 0 ? arr[i - 1].value : null,
        next: i < arr.length - 1 ? arr[i + 1].value : null,
      }));
  }, [recordsQuery.data, range]);

  // simple least-squares trend line (same math as the training Graph tab)
  const data = useMemo<GraphPoint[]>(() => {
    if (!showTrend || points.length < 3) return points;
    const n = points.length;
    const xs = points.map((_, i) => i);
    const ys = points.map((p) => p.value);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    return points.map((p, i) => ({ ...p, trend: Math.round((intercept + slope * i) * 100) / 100 }));
  }, [points, showTrend]);

  const fmt = useCallback((v: number) => `${round2(v)}${unit ? ` ${unit}` : ""}`, [unit]);

  const hasGoal =
    !!measurement &&
    measurement.targetValue != null &&
    ["SPECIFIC", "INCREASE", "DECREASE"].includes(measurement.goalType);
  const goalValue = measurement?.targetValue ?? null;

  if (recordsQuery.isLoading || !measurement) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-[240px] w-full rounded-lg lg:h-[360px]" />
        <Skeleton className="h-18 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ControlRow — 48px data-row: metric | range | ⋮ options */}
      <div data-row className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap">
        <Select value={effectiveId} onValueChange={setSelectedId} {...tourAttrs({ skipTour: true, reason: "Metric select root renders no DOM node" })}>
          <SelectTrigger
            className="h-11 min-w-0 flex-1 rounded-lg text-sm font-semibold"
            aria-label="Measurement"
            {...tourAttrs({ id: "body.metric", label: "Metric", help: "Choose which measurement to chart.", order: 90 })}
          >
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
        <Select value={range} onValueChange={(v) => setRange(v as RangeValue)} {...tourAttrs({ skipTour: true, reason: "Range select root renders no DOM node" })}>
          <SelectTrigger
            className="h-11 w-[88px] flex-none rounded-lg text-sm font-semibold"
            aria-label="Graph range"
            {...tourAttrs({ id: "body.range", label: "Range", help: "Limit the chart to 3M, 6M or all time.", order: 100 })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="h-11 w-11 flex-none px-0" aria-label="Chart options" tour={{ id: "body.chartMenu", label: "Chart options", help: "Toggle points, trend line and zero-based axis.", order: 110 }}>
              <MoreVertical className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuCheckboxItem checked={showPoints} onCheckedChange={(v) => setShowPoints(!!v)}>
              Show points
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showTrend} onCheckedChange={(v) => setShowTrend(!!v)}>
              Trend line
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={fromZero} onCheckedChange={(v) => setFromZero(!!v)}>
              Y axis from zero
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chart box — fixed height; charts may scale internally (allowed exemption) */}
      <div className="flex h-[240px] flex-none items-center justify-center overflow-hidden rounded-lg border bg-card p-2 lg:h-[360px]">
        {points.length === 0 ? (
          <p className="px-4 text-center text-sm text-muted-foreground">
            No data to chart for {measurement.name} yet
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              <Tooltip content={<GraphTooltip formatter={fmt} onSelect={onSelectPoint} />} />
              {hasGoal && goalValue != null ? (
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
              ) : null}
              {showTrend && data[0]?.trend != null ? (
                <Line
                  type="linear"
                  dataKey="trend"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={showPoints ? { r: 3, fill: "var(--primary)", strokeWidth: 0 } : false}
                activeDot={{
                  r: 5,
                  fill: "var(--primary)",
                  strokeWidth: 2,
                  stroke: "var(--background)",
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* DetailRow — fixed 72px, always reserved; `–` when nothing selected */}
      <div data-row className={cn(rowHero, "gap-3 px-3")}>
        {selected ? (
          <>
            <span className="flex-none text-sm font-semibold">{selected.label}</span>
            <span className="flex-none text-xl font-bold tabular-nums text-primary">{fmt(selected.value)}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {selected.prev != null ? `prev ${fmt(selected.prev)}` : ""}
              {selected.prev != null && selected.next != null ? " · " : ""}
              {selected.next != null ? `next ${fmt(selected.next)}` : ""}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">–</span>
        )}
      </div>
    </div>
  );
}

function GraphTooltip({
  active,
  payload,
  formatter,
  onSelect,
}: {
  active?: boolean;
  payload?: Array<{ payload: GraphPoint }>;
  formatter: (v: number) => string;
  onSelect: (p: GraphPoint | null) => void;
}) {
  const point = active && payload?.length ? payload[0].payload : null;
  if (point) onSelect(point);
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{point.label}</p>
      <p className="font-bold tabular-nums text-primary">{formatter(point.value)}</p>
    </div>
  );
}
