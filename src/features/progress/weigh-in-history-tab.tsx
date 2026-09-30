"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WeighInHistoryTab — the §8.1 History tab: sticky 40px month headers
// ("September 2026") + 40px rows "{d Mon} · {v} {unit} · {±delta}" (delta vs
// the previous entry). Delete = the app's list-row pattern: trailing ⋮
// ActionList → Delete (destructive confirm modal) — the same flow as the
// Builder "Your workouts" rows. Empty: "No weigh-ins yet." + Log action.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActionList } from "@/components/shared/action-list";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { useInvalidate } from "@/lib/client/query";
import { measurementsApi } from "@/lib/client/api";
import { formatDayShort, round1 } from "@/lib/client/format";
import { hapticTap } from "@/lib/client/haptics";
import { errorMessage } from "@/features/routines/screen-helpers";
import { useBodyWeight, localDayKey } from "@/features/body/use-body-weight";
import { cn } from "@/lib/utils";
import type { MeasurementRecordDTO } from "@/lib/types";

type HistoryRow = { record: MeasurementRecordDTO; delta: number | null };

/** Signed one-decimal delta ("+0.4" / "−0.6" / "±0"). */
function signedDelta(delta: number): string {
  const v = Math.round(delta * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`;
}

export function WeighInHistoryTab() {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const { records, unit, loading } = useBodyWeight();
  const [deleteTarget, setDeleteTarget] = useState<MeasurementRecordDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // newest first; delta vs the chronologically previous entry
  const rows = useMemo<HistoryRow[]>(() => {
    const desc = [...records].reverse();
    return desc.map((r, i) => ({
      record: r,
      delta: i + 1 < desc.length ? desc[i].value - desc[i + 1].value : null,
    }));
  }, [records]);

  // month groups (newest first) — "September 2026"
  const groups = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const row of rows) {
      const key = localDayKey(row.record.recordedAt).slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const monthLabel = (monthKey: string): string => {
    const d = new Date(`${monthKey}-01T00:00:00.000Z`);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    try {
      await measurementsApi.removeRecord(target.measurementId, target.id);
      invalidate.measurements();
      void qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Weigh-in deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading weigh-in history">
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
        className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-4 text-sm text-muted-foreground"
      >
        <span className="min-w-0 flex-1 truncate">No weigh-ins yet.</span>
        <button
          type="button"
          {...tourAttrs({ id: "progress.historyLog", label: "Log", help: "Log your first weigh-in.", order: 10 })}
          onClick={() => navigate("/progress/log")}
          className="flex h-9 flex-none items-center rounded-md px-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Log
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {groups.map(([monthKey, monthRows]) => (
        <div key={monthKey} className="flex flex-col">
          <p
            data-row
            className="sticky top-0 z-10 flex h-10 flex-none items-center overflow-hidden whitespace-nowrap border-b bg-background/95 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
            aria-label={monthLabel(monthKey)}
          >
            <span className="truncate">{monthLabel(monthKey)}</span>
          </p>
          {monthRows.map((row) => {
            const day = localDayKey(row.record.recordedAt);
            return (
              <div
                key={row.record.id}
                data-row
                className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/50"
              >
                <span className="w-[72px] flex-none truncate text-xs text-muted-foreground">
                  {formatDayShort(day)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums">
                  {round1(row.record.value)}
                  <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span>
                </span>
                <span
                  className={cn(
                    "w-[48px] flex-none truncate text-right text-[11px] font-semibold tabular-nums",
                    row.delta == null
                      ? "text-muted-foreground/60"
                      : row.delta > 0
                        ? "text-red-500"
                        : row.delta < 0
                          ? "text-emerald-500"
                          : "text-muted-foreground",
                  )}
                >
                  {row.delta != null ? signedDelta(row.delta) : "–"}
                </span>
                <ActionList
                  label={`Options for weigh-in on ${formatDayShort(day)}`}
                  align="end"
                  trigger={
                    <button
                      type="button"
                      aria-label={`Options for weigh-in on ${formatDayShort(day)}`}
                      disabled={deleting}
                      {...tourAttrs({ id: "progress.historyMenu", label: "Weigh-in options", help: "Delete this weigh-in entry.", order: 20 })}
                      onClick={() => hapticTap()}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                  }
                  items={[
                    {
                      id: "delete",
                      label: "Delete",
                      danger: true,
                      onSelect: () => setDeleteTarget(row.record),
                    },
                  ]}
                />
              </div>
            );
          })}
        </div>
      ))}

      {/* destructive confirm — the app's list-row delete pattern */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this weigh-in?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${round1(deleteTarget.value)} ${unit} on ${formatDayShort(localDayKey(deleteTarget.recordedAt))} will be removed. Attached progress photos are deleted with it.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
