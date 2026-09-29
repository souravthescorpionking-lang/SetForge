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
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useMeasurements } from "@/lib/client/query";
import { measurementsApi } from "@/lib/client/api";
import { movingAverage7 } from "@/lib/grouping";
import { round1 } from "@/lib/client/format";
import type { MeasurementDTO } from "@/lib/types";

/** The body-weight measurement: name match first, then the default, then any. */
function pickBodyMeasurement(measurements: MeasurementDTO[]): MeasurementDTO | null {
  return (
    measurements.find((m) => m.isEnabled && /weight/i.test(m.name)) ??
    measurements.find((m) => m.isEnabled && m.isDefault) ??
    measurements.find((m) => m.isEnabled) ??
    null
  );
}

/** "▼0.6" / "▲0.4" / null when there is no previous point to compare. */
function deltaGlyph(delta: number): string {
  const v = Math.round(Math.abs(delta) * 10) / 10;
  if (v < 0.05) return "±0";
  return `${delta < 0 ? "▼" : "▲"}${round1(v)}`;
}

export function BodyRow() {
  const navigate = useApp((s) => s.navigate);
  const measurementsQuery = useMeasurements();
  const measurements = useMemo(
    () => measurementsQuery.data?.measurements ?? [],
    [measurementsQuery.data],
  );
  const body = useMemo(() => pickBodyMeasurement(measurements), [measurements]);

  const recordsQuery = useQuery({
    queryKey: qk.measurementRecords(body?.id ?? ""),
    queryFn: () => measurementsApi.records(body!.id),
    enabled: !!body,
    staleTime: 30_000,
  });

  const view = useMemo(() => {
    if (!body) return null;
    const records = recordsQuery.data?.records ?? [];
    if (records.length === 0) return null;
    const points = records.map((r) => ({ at: new Date(r.recordedAt).getTime(), value: r.value }));
    const series = movingAverage7(points);
    if (series.length === 0) return null;
    const avg = series[series.length - 1].value;
    const prevAvg = series.length > 1 ? series[series.length - 2].value : null;
    // latest raw entry (records are not guaranteed ordered)
    const raw = points.reduce((a, b) => (b.at >= a.at ? b : a)).value;
    return {
      unit: body.unit.name,
      avg,
      delta: prevAvg != null ? avg - prevAvg : null,
      raw,
    };
  }, [body, recordsQuery.data]);

  const loading = measurementsQuery.isLoading || (!!body && recordsQuery.isLoading);
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
      aria-label={view ? `Body weight: ${round1(view.avg)} ${view.unit}, 7-day average` : "Log your first weigh-in"}
      className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-left transition-colors hover:bg-accent/40"
    >
      {view ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold tabular-nums">
              {round1(view.avg)} {view.unit}
            </span>
            {view.delta != null ? (
              <span className="ml-1.5 text-xs text-muted-foreground">{deltaGlyph(view.delta)}</span>
            ) : null}
            <span className="ml-1.5 text-xs text-muted-foreground">7-day avg</span>
          </span>
          <span className="flex-none text-xs tabular-nums text-muted-foreground">{round1(view.raw)}</span>
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
