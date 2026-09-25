"use client";

// Shared trend chart (Recharts) with built-in toggles: points, trend line, y-from-zero.
// Point tooltips include prev/next navigation context.
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GraphPointDTO } from "@/lib/types";
import { formatDayShort } from "@/lib/client/format";

type Props = {
  points: GraphPointDTO[];
  height?: number;
  valueSuffix?: string;
  valueFormatter?: (v: number) => string;
  defaultFromZero?: boolean;
  className?: string;
};

function TrendTooltip({
  active,
  payload,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ payload: GraphPointDTO }>;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{formatDayShort(p.date)}</p>
      <p className="text-primary font-bold numeric">{formatter(p.value)}</p>
      {(p.prev != null || p.next != null) && (
        <p className="text-muted-foreground mt-0.5">
          {p.prev != null && <span>prev {formatter(p.prev)} </span>}
          {p.next != null && <span>· next {formatter(p.next)}</span>}
        </p>
      )}
    </div>
  );
}

export function TrendChart({
  points,
  height = 260,
  valueSuffix = "",
  valueFormatter,
  defaultFromZero = false,
  className,
}: Props) {
  const [showPoints, setShowPoints] = useState(true);
  const [showTrend, setShowTrend] = useState(true);
  const [fromZero, setFromZero] = useState(defaultFromZero);

  const fmt = useMemo(() => valueFormatter ?? ((v: number) => `${Math.round(v * 100) / 100}${valueSuffix}`), [valueFormatter, valueSuffix]);

  const data = useMemo(() => {
    const withDerived = points.map((p, i) => ({
      ...p,
      prev: i > 0 ? points[i - 1].value : null,
      next: i < points.length - 1 ? points[i + 1].value : null,
      label: formatDayShort(p.date),
    }));
    if (showTrend && withDerived.length >= 3) {
      // simple least-squares trend line
      const n = withDerived.length;
      const xs = withDerived.map((_, i) => i);
      const ys = withDerived.map((p) => p.value);
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
      return withDerived.map((p, i) => ({ ...p, trend: Math.round((intercept + slope * i) * 100) / 100 }));
    }
    return withDerived;
  }, [points, showTrend]);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground rounded-xl border border-dashed"
        style={{ height }}
      >
        No data to chart yet
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex justify-end mb-1">
        <ToggleGroup type="multiple" size="sm" variant="outline" className="gap-1">
          <ToggleGroupItem
            value="points"
            aria-label="Toggle points"
            data-state={showPoints ? "on" : "off"}
            onClick={() => setShowPoints((v) => !v)}
            className="text-xs px-2 h-7"
          >
            Points
          </ToggleGroupItem>
          <ToggleGroupItem
            value="trend"
            aria-label="Toggle trend line"
            data-state={showTrend ? "on" : "off"}
            onClick={() => setShowTrend((v) => !v)}
            className="text-xs px-2 h-7"
          >
            Trend
          </ToggleGroupItem>
          <ToggleGroupItem
            value="zero"
            aria-label="Toggle y from zero"
            data-state={fromZero ? "on" : "off"}
            onClick={() => setFromZero((v) => !v)}
            className="text-xs px-2 h-7"
          >
            0-Y
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
            width={48}
            domain={fromZero ? [0, "auto"] : ["auto", "auto"]}
            tickFormatter={(v: number) => fmt(v)}
          />
          <Tooltip content={<TrendTooltip formatter={fmt} />} />
          {showTrend && data[0]?.trend != null && (
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
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={showPoints ? { r: 3, fill: "var(--primary)", strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--background)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
