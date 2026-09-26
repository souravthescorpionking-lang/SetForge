"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyHistoryTab — HISTORY tab of #/body (Part 3 p3-7).
//
// Flat 40px [data-row] table of every measurement record, newest first:
//   Date 88px | Name flex (ellipsis) | Value 72px (tabular) | Δ 56px
// Δ = change vs the previous record of the same measurement (legacy
// history-tab prevOf logic). Data ported from legacy history-tab.tsx; the
// legacy per-record edit/delete dialogs are intentionally dropped (spec: read
// table; new entries go through the Track tab's inline editor).
// ─────────────────────────────────────────────────────────────────────────────

import { useQueries } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { measurementsApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayShort, round2 } from "@/lib/client/format";
import type { MeasurementDTO, MeasurementRecordDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deltaTone, localDayKey, signedDelta } from "./body-util";

type Props = {
  measurements: MeasurementDTO[];
  loading: boolean;
};

type HistoryRow = {
  record: MeasurementRecordDTO;
  measurement: MeasurementDTO;
  delta: number | null;
};

const TONE_CLASS = {
  good: "text-emerald-500",
  bad: "text-red-500",
  flat: "text-muted-foreground",
} as const;

export function BodyHistoryTab({ measurements, loading }: Props) {
  const queries = useQueries({
    queries: measurements.map((m) => ({
      queryKey: qk.measurementRecords(m.id),
      queryFn: () => measurementsApi.records(m.id),
      staleTime: 30_000,
    })),
  });

  // merge every measurement's records into one newest-first table; the
  // previous entry of a record is the next one in its own (desc) list
  const rows: HistoryRow[] = [];
  queries.forEach((query, i) => {
    const m = measurements[i];
    if (!m || !query.data) return;
    const records = query.data.records;
    records.forEach((r, j) => {
      rows.push({
        record: r,
        measurement: m,
        delta: j + 1 < records.length ? Math.round((r.value - records[j + 1].value) * 100) / 100 : null,
      });
    });
  });
  rows.sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt));

  const anyLoading = loading || (measurements.length > 0 && queries.some((q) => q.isLoading));

  if (anyLoading && rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        data-row
        className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
      >
        No entries yet — log your first values from the Track tab.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const m = row.measurement;
        const tone = row.delta != null ? deltaTone(m.goalType, row.delta) : null;
        return (
          <div
            key={row.record.id}
            data-row
            className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50"
          >
            <span className="w-[88px] flex-none truncate text-xs text-muted-foreground">
              {formatDayShort(localDayKey(row.record.recordedAt))}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
            <span className="w-[72px] flex-none truncate text-right text-sm font-bold tabular-nums">
              {round2(row.record.value)}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{m.unit.name}</span>
            </span>
            <span
              className={cn(
                "w-[56px] flex-none truncate text-right text-[11px] font-semibold tabular-nums",
                tone ? TONE_CLASS[tone] : "text-muted-foreground",
              )}
            >
              {row.delta != null ? signedDelta(row.delta) : "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
