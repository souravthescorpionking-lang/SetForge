"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MonthView — the Part 3 calendar month page (p3-6, extended in Part 5).
//
//   weekday header row : 32px (h-8) · muted · single-line · NOT a data-row
//                        (section-header height per the layout laws)
//   grid               : FIXED 6 rows × 7 columns — every cell EXACTLY 56px
//                        (h-14). Grid CELLS are not rows: they carry no
//                        data-row tag, but the 56px height is exact.
//   cell content       : date number top-left (12px) + a 10px muted projected
//                        day-name ghost label under it (showProjectedDays);
//                        bottom: ≤3 dots + "+n" — schedule status dots
//                        (PLANNED = outlined orange · DONE = filled orange ·
//                        MISSED = muted grey · SKIPPED = grey dashed ring) plus
//                        the legacy workout category dots; selected cell =
//                        orange ring; today = orange date number.
//
// Data logic ported from legacy features/calendar/month-grid.tsx (UTC day-key
// math, category dots); the fixed 6-row grid + 56px cells are the p3-6 spec.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { todayKey } from "@/lib/client/format";
import type { ProjectedDayDTO, ScheduleEntryDTO, WorkoutSummaryDTO } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { dedupeCategories, monthCells, weekdayLabels, type MonthAnchor } from "./month-utils";

const MAX_DOTS = 3;

type Props = {
  anchor: MonthAnchor;
  /** 0 = Sunday, 1 = Monday (user setting; legacy default 1). */
  weekStart: number;
  /** Workout summaries of the visible month, indexed by day key. */
  byDay: Map<string, WorkoutSummaryDTO>;
  /** Part 5: schedule entries of the visible month, indexed by day key. */
  entryByDay: Map<string, ScheduleEntryDTO>;
  /** Part 5: projected ghost days (showProjectedDays), indexed by day key. */
  projectedByDay: Map<string, ProjectedDayDTO>;
  selectedDay: string;
  loading: boolean;
  onSelect: (dayKey: string) => void;
};

/** The schedule status dot for an entry (null = no dot). */
function scheduleDotClass(status: string): string | null {
  switch (status) {
    case "PLANNED":
      return "h-1.5 w-1.5 rounded-full border-[1.5px] border-primary bg-transparent";
    case "DONE":
      return "h-1.5 w-1.5 rounded-full bg-primary";
    case "MISSED":
      return "h-1.5 w-1.5 rounded-full bg-muted-foreground/50";
    case "SKIPPED":
      return "h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/60 bg-transparent";
    default:
      return null;
  }
}

export function MonthView({
  anchor,
  weekStart,
  byDay,
  entryByDay,
  projectedByDay,
  selectedDay,
  loading,
  onSelect,
}: Props) {
  const cells = useMemo(() => monthCells(anchor, weekStart), [anchor, weekStart]);
  const labels = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const today = todayKey();

  if (loading && byDay.size === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading month">
        <div className="grid grid-cols-7 gap-1">
          {labels.map((l) => (
            <div
              key={l}
              className="flex h-8 items-center justify-center overflow-hidden text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* weekday header — 32px single-line, muted */}
      <div className="grid grid-cols-7 gap-1" aria-hidden={false}>
        {labels.map((l) => (
          <div
            key={l}
            className="flex h-8 items-center justify-center overflow-hidden text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {l}
          </div>
        ))}
      </div>

      {/* fixed 6×7 grid — cells are exactly 56px (h-14) */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month grid">
        {cells.map((dayKey, i) => {
          if (dayKey === null) {
            return <div key={`blank-${i}`} aria-hidden className="h-14 rounded-lg" />;
          }
          const workout = byDay.get(dayKey);
          const entry = entryByDay.get(dayKey);
          const projected = projectedByDay.get(dayKey);
          const isToday = dayKey === today;
          const isSelected = dayKey === selectedDay;
          const dayNum = Number(dayKey.slice(8, 10));
          const cats = workout ? dedupeCategories(workout) : [];
          const schedDot = entry ? scheduleDotClass(entry.status) : null;
          const dotsCount = (schedDot ? 1 : 0) + cats.length;
          return (
            <button
              key={dayKey}
              type="button"
              data-day-cell={dayKey}
              aria-label={`${dayKey}${workout ? " — workout day" : ""}${entry ? ` — ${entry.routineName}${entry.dayName ? ` · ${entry.dayName}` : ""} (${entry.status.toLowerCase()})` : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onClick={() => onSelect(dayKey)}
              className={cn(
                "flex h-14 select-none flex-col items-start justify-between overflow-hidden rounded-lg border p-1 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary"
                  : workout || entry?.status === "PLANNED"
                    ? "border-border/80 bg-card hover:border-primary/50 hover:bg-primary/5"
                    : "border-transparent bg-muted/25 hover:bg-muted/50",
              )}
            >
              <span className="flex w-full flex-col gap-0.5">
                <span
                  className={cn(
                    "text-xs font-semibold leading-none tabular-nums",
                    isToday
                      ? "text-primary"
                      : workout
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {dayNum}
                </span>
                {projected ? (
                  <span
                    className="w-full truncate text-[10px] font-medium leading-none text-muted-foreground/80"
                    title={`${projected.dayName} (projected)`}
                  >
                    {projected.dayName}
                  </span>
                ) : null}
              </span>
              {dotsCount > 0 ? (
                <span className="flex w-full items-center gap-1 overflow-hidden">
                  {schedDot ? (
                    <span
                      className={cn(schedDot, "flex-none")}
                      title={`${entry?.routineName}${entry?.dayName ? ` · ${entry.dayName}` : ""} — ${entry?.status.toLowerCase()}`}
                      aria-hidden
                    />
                  ) : null}
                  {cats.slice(0, Math.max(0, MAX_DOTS - (schedDot ? 1 : 0))).map((c) => (
                    <span
                      key={c.name}
                      title={c.name}
                      className="h-1.5 w-1.5 flex-none rounded-full"
                      style={{ backgroundColor: c.colour }}
                      aria-hidden
                    />
                  ))}
                  {dotsCount > MAX_DOTS ? (
                    <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                      +{dotsCount - MAX_DOTS}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
