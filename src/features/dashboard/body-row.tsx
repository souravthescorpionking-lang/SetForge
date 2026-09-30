"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyRow — the 48px "Body" row of the Dashboard tab (Part 8 §3.2, §6.6).
//
//   82.4 kg ▼0.6 · 7-day avg            81.4  >
//
// PRIMARY value = the 7-day moving average of the body-weight measurement
// (computed with `movingAverage7`); ▼/▲ is the change vs the previous average
// point; the raw latest value sits 12px muted on the right. Tap → #/body.
// Empty state: "— · Log your first weigh-in".
//
// Part 10 §7: the weight data moved into useBodyWeight (features/body) — the
// shared view behind this row, the Stats tile and the §8 Progress screens.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { movingAverage7 } from "@/lib/grouping";
import { round1 } from "@/lib/client/format";
import { useBodyWeight } from "@/features/body/use-body-weight";

/** "▼0.6" / "▲0.4" / null when there is no previous point to compare. */
function deltaGlyph(delta: number): string {
  const v = Math.round(Math.abs(delta) * 10) / 10;
  if (v < 0.05) return "±0";
  return `${delta < 0 ? "▼" : "▲"}${round1(v)}`;
}

export function BodyRow() {
  const navigate = useApp((s) => s.navigate);
  const { avg, delta, raw, unit, loading } = useBodyRowView();

  if (loading) {
    return <Skeleton className="h-12 w-full rounded-lg" aria-busy="true" aria-hidden />;
  }

  return (
    <button
      type="button"
      data-row
      {...tourAttrs({
        id: "dashboard.body",
        label: "Body weight",
        help: "Latest weight with its 7-day average. Tap to log a weigh-in.",
        order: 40,
      })}
      onClick={() => navigate("/body")}
      aria-label={avg != null ? `Body weight: ${round1(avg)} ${unit}, 7-day average` : "Log your first weigh-in"}
      className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40"
    >
      {avg != null ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold tabular-nums">
              {round1(avg)} {unit}
            </span>
            {delta != null ? (
              <span className="ml-1.5 text-xs text-muted-foreground">{deltaGlyph(delta)}</span>
            ) : null}
            <span className="ml-1.5 text-xs text-muted-foreground">7-day avg</span>
          </span>
          {raw != null ? (
            <span className="flex-none text-xs tabular-nums text-muted-foreground">{round1(raw)}</span>
          ) : null}
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          — · Log your first weigh-in
        </span>
      )}
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
    </button>
  );
}

/** The row's display values (avg + Δ vs previous avg point + raw latest). */
function useBodyRowView(): {
  avg: number | null;
  delta: number | null;
  raw: number | null;
  unit: string | null;
  loading: boolean;
} {
  const { records, latest, avg7, unit, loading } = useBodyWeight();
  return useMemo(() => {
    if (records.length === 0) return { avg: null, delta: null, raw: null, unit, loading };
    const points = records.map((r) => ({ at: new Date(r.recordedAt).getTime(), value: r.value }));
    const series = movingAverage7(points);
    const avg = series.length > 0 ? series[series.length - 1].value : null;
    const prevAvg = series.length > 1 ? series[series.length - 2].value : null;
    return {
      avg,
      delta: avg != null && prevAvg != null ? avg - prevAvg : null,
      raw: latest,
      unit,
      loading,
    };
  }, [records, latest, unit, loading]);
}
