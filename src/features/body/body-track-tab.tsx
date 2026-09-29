"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BodyTrackTab — TRACK tab of #/body (Part 3 p3-7).
//
//   • 56px [data-row]s: name (line 1) + "3d ago" muted 12px (line 2) stacked
//     left | 120px right column with the latest value (tabular) + Δ line.
//   • Tapping a row expands an INLINE EDITOR block below it (NOT a
//     data-row): value input + native date input + Save/Cancel + the Part 6
//     §4.14 photo section (photo-slots.tsx). Only one row is expanded at a
//     time — this replaces the legacy record-form dialog.
//   • Data/mutation logic ported from legacy track-tab.tsx / record-form.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { measurementsApi } from "@/lib/client/api";
import { qk, useInvalidate } from "@/lib/client/query";
import { relativeFromNow, round2 } from "@/lib/client/format";
import type { MeasurementDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dateInputToIso, localDayKey, localTodayInput, useBodyAction, DeltaLine } from "./body-util";
import { PhotoSlots } from "./photo-slots";

type Props = {
  measurements: MeasurementDTO[];
  loading: boolean;
  /** Which row's inline editor is open (one at a time; owned by the screen so
   *  the ⋮ → "Add measurement" action can open the first row directly). */
  expandedId: string | null;
  onExpandedChange: (id: string | null) => void;
};

export function BodyTrackTab({ measurements, loading, expandedId, onExpandedChange }: Props) {
  const enabled = useMemo(() => measurements.filter((m) => m.isEnabled), [measurements]);

  if (loading && measurements.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (enabled.length === 0) {
    return (
      <div
        data-row
        className="flex h-12 items-center overflow-hidden whitespace-nowrap text-sm text-muted-foreground"
      >
        No metrics enabled — use ⋮ → Configure metrics to turn some on.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {enabled.map((m) => (
        <div key={m.id} className="flex flex-col gap-2">
          <button
            type="button"
            data-row
            aria-expanded={expandedId === m.id}
            {...tourAttrs({ id: "body.row", label: "Metric row", help: "Tap a metric to log a new entry for a date.", order: 50 })}
            onClick={() => onExpandedChange(expandedId === m.id ? null : m.id)}
            className={cn(
              "flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/50",
              expandedId === m.id && "border-primary/50 bg-primary/5",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold">{m.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {m.lastRecordedAt ? relativeFromNow(m.lastRecordedAt) : "no entries yet"}
              </span>
            </span>
            <span className="flex w-[120px] flex-none flex-col items-end overflow-hidden">
              {m.lastValue != null ? (
                <>
                  <span className="truncate text-sm font-bold tabular-nums">
                    {round2(m.lastValue)}
                    <span className="ml-1 text-[10px] font-medium text-muted-foreground">{m.unit.name}</span>
                  </span>
                  <DeltaLine
                    goalType={m.goalType}
                    last={m.lastValue}
                    prev={m.prevValue}
                    target={m.targetValue}
                  />
                </>
              ) : (
                <span className="text-sm text-muted-foreground">–</span>
              )}
            </span>
          </button>

          {expandedId === m.id ? (
            <TrackEditor
              key={`${m.id}-${m.lastRecordedAt ?? "new"}`}
              measurement={m}
              onClose={() => onExpandedChange(null)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── inline editor (NOT a data-row): entry fields + §4.14 photo section ──────

function TrackEditor({ measurement: m, onClose }: { measurement: MeasurementDTO; onClose: () => void }) {
  const act = useBodyAction();
  const inv = useInvalidate();
  const [value, setValue] = useState<string>(m.lastValue != null ? String(m.lastValue) : "");
  const [date, setDate] = useState<string>(localTodayInput);
  const [saving, setSaving] = useState(false);

  // §4.14: this metric's records — binds the editor's selected date to the
  // MeasurementRecord that photos attach to (null = no entry on that date yet,
  // in which case a photo tap creates one with the value above).
  const recordsQuery = useQuery({
    queryKey: qk.measurementRecords(m.id),
    queryFn: () => measurementsApi.records(m.id),
  });
  const records = useMemo(() => recordsQuery.data?.records ?? [], [recordsQuery.data]);
  const record = useMemo(
    () => records.find((r) => localDayKey(r.recordedAt) === date) ?? null,
    [records, date],
  );

  const save = async () => {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid value first");
      return;
    }
    setSaving(true);
    const recordedAt = dateInputToIso(date);
    const payload = { value: n, ...(recordedAt ? { recordedAt } : {}) };
    const ok = await act({
      path: `/api/measurements/${m.id}/records`,
      method: "POST",
      body: payload,
      label: `${m.name} entry`,
      run: () => measurementsApi.addRecord(m.id, payload),
      successMsg: `${m.name}: ${round2(n)} ${m.unit.name} logged`,
      onDone: () => inv.measurements(),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="flex flex-none flex-col gap-1 rounded-lg border border-primary/40 bg-card p-1.5">
      <div className="flex h-10 flex-none gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className="h-full flex-1 rounded-lg text-base font-semibold tabular-nums"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Value (${m.unit.name})`}
          aria-label={`New ${m.name} value in ${m.unit.name}`}
          {...tourAttrs({ id: "body.value", label: "Value", help: "Type the number you measured for this entry.", order: 60 })}
        />
        <Input
          type="date"
          className="h-full w-[132px] flex-none rounded-lg tabular-nums"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Entry date"
        />
      </div>
      <div className="flex h-10 flex-none gap-2">
        <Button
          type="button"
          className="h-full flex-1 font-semibold"
          disabled={saving}
          tour={{ id: "body.save", label: "Save entry", help: "Store the value (and any photos) for the date.", order: 70 }}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save entry"}
        </Button>
        <Button type="button" variant="outline" className="h-full flex-1" disabled={saving} tour={{ skipTour: true, reason: "Secondary cancel next to the Save entry button" }} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <PhotoSlots
        measurement={m}
        record={record}
        recordsLoading={recordsQuery.isLoading}
        value={value}
        date={date}
      />
    </div>
  );
}
