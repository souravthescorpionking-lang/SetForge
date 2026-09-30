"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WeightChart — the §8.1 Weigh-in tab chart. The same Recharts patterns as
// body-graph-tab (LineChart, muted grid, UTC day labels) with the weight
// series + its 7-day average line (movingAverage7 — the same helper the
// Dashboard BodyRow uses). Below it: the 56px latest-value row.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { movingAverage7 } from "@/lib/grouping";
import { formatDayShort, round1 } from "@/lib/client/format";
import { useBodyWeight, localDayKey } from "@/features/body/use-body-weight";
import type { MeasurementRecordDTO } from "@/lib/types";

type ChartPoint = {
  label: string;
  value: number;
  avg: number | null;
};

function buildPoints(records: MeasurementRecordDTO[]): ChartPoint[] {
  const sorted = [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const series = movingAverage7(sorted.map((r) => ({ at: new Date(r.recordedAt).getTime(), value: r.value })));
  return sorted.map((r, i) => ({
    label: formatDayShort(localDayKey(r.recordedAt)),
    value: r.value,
    avg: series[i]?.value ?? null,
  }));
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  unit: string;
}) {
  const point = active && payload?.length ? payload[0].payload : null;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{point.label}</p>
      <p className="font-bold tabular-nums text-primary">
        {round1(point.value)} {unit}
      </p>
      {point.avg != null ? (
        <p className="tabular-nums text-muted-foreground">7-day avg {round1(point.avg)}</p>
      ) : null}
    </div>
  );
}

export function WeightChartTab() {
  const navigate = useApp((s) => s.navigate);
  const { records, latest, avg7, unit, loading } = useBodyWeight();

  const data = useMemo(() => buildPoints(records), [records]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading weigh-in chart">
        <Skeleton className="h-[240px] w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        data-row
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm text-muted-foreground"
      >
        <span className="min-w-0 flex-1 truncate">No weigh-ins yet.</span>
        <button
          type="button"
          {...tourAttrs({ id: "progress.logFirst", label: "Log", help: "Log your first weigh-in.", order: 10 })}
          onClick={() => navigate("/progress/log")}
          className="flex h-9 flex-none items-center rounded-md px-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Log
        </button>
      </div>
    );
  }

  const last = records[records.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[240px] flex-none items-center justify-center overflow-hidden rounded-lg border bg-card p-2">
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
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => round1(v)}
            />
            <Tooltip content={<ChartTooltip unit={unit ?? ""} />} />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
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
      </div>

      {/* latest value row (56px) → tap logs the next weigh-in */}
      <button
        type="button"
        data-row
        {...tourAttrs({
          id: "progress.latest",
          label: "Latest weigh-in",
          help: "Your most recent weigh-in with its 7-day average. Tap to log another.",
          order: 20,
        })}
        onClick={() => navigate("/progress/log")}
        aria-label={
          last
            ? `Latest weigh-in ${round1(last.value)} ${unit} on ${formatDayShort(localDayKey(last.recordedAt))}`
            : "Log your first weigh-in"
        }
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold tabular-nums">
            {latest != null ? `${round1(latest)} ${unit}` : "—"}
          </span>
          {avg7 != null ? (
            <span className="ml-1.5 text-xs text-muted-foreground">7-day avg {round1(avg7)}</span>
          ) : null}
          {last ? (
            <span className="ml-1.5 text-xs text-muted-foreground">
              · {formatDayShort(localDayKey(last.recordedAt))}
            </span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
      </button>
    </div>
  );
}
