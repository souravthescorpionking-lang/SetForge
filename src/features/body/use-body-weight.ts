"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useBodyWeight — the ONE body-weight view over the measurements system
// (the repo's weigh-in entity: the "Body Weight"-ish Measurement + its
// records). Shared by the Dashboard BodyRow (Part 8 §3.2), the Part 10 §7
// Stats tile and the §8 Progress screens — never a parallel weight table.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk, useMeasurements } from "@/lib/client/query";
import { measurementsApi } from "@/lib/client/api";
import { movingAverage7 } from "@/lib/grouping";
import { localDayKey } from "./body-util";
import type { MeasurementDTO, MeasurementRecordDTO } from "@/lib/types";

/** The body-weight measurement: name match first, then the default, then any. */
export function pickBodyMeasurement(measurements: MeasurementDTO[]): MeasurementDTO | null {
  return (
    measurements.find((m) => m.isEnabled && /weight/i.test(m.name)) ??
    measurements.find((m) => m.isEnabled && m.isDefault) ??
    measurements.find((m) => m.isEnabled) ??
    null
  );
}

export type BodyWeightView = {
  /** The weight measurement (null only when the metric list is empty). */
  measurement: MeasurementDTO | null;
  /** All records, oldest → newest (stable order for charts + history lists). */
  records: MeasurementRecordDTO[];
  /** Newest raw entry value (null when no records). */
  latest: number | null;
  /** Newest 7-day moving-average value (null when no records). */
  avg7: number | null;
  /** Display unit name (e.g. "kg"). */
  unit: string | null;
  loading: boolean;
};

/** Records of the body-weight measurement + derived latest/7-day-average. */
export function useBodyWeight(): BodyWeightView {
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

  const records = useMemo(
    () =>
      [...(recordsQuery.data?.records ?? [])].sort((a, b) =>
        a.recordedAt.localeCompare(b.recordedAt),
      ),
    [recordsQuery.data],
  );

  const { latest, avg7 } = useMemo(() => {
    if (records.length === 0) return { latest: null, avg7: null };
    const points = records.map((r) => ({ at: new Date(r.recordedAt).getTime(), value: r.value }));
    const series = movingAverage7(points);
    return {
      latest: points.reduce((a, b) => (b.at >= a.at ? b : a)).value,
      avg7: series.length > 0 ? series[series.length - 1].value : null,
    };
  }, [records]);

  const loading = measurementsQuery.isLoading || (!!body && recordsQuery.isLoading);

  return {
    measurement: body,
    records,
    latest,
    avg7,
    unit: body?.unit.name ?? null,
    loading,
  };
}

/** Local calendar-day key of a body record (body entries are wall-clock). */
export { localDayKey };
