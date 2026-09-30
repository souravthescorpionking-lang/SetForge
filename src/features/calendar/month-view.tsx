"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MonthView — the §6 calendar: CONTINUOUS vertical months (Part 9 §6).
//
//   weekday header row : 32px (h-8) · muted · single-line — NOT a data-row
//                        (section-header height per the layout laws); rendered
//                        ONCE above all months
//   month sections     : sticky 40px (h-10) data-row header "October 2026"
//                        (sticky top-0 — the sanctioned sticky-header pattern;
//                        next month's header pushes it away, iOS-calendar
//                        style) + a 7-column grid of EXACTLY 40px (h-10) cells
//   cell content       : date number top-left · bottom: ≤3 schedule status
//                        dots + "+n" — DONE → accent filled (markedOff adds a
//                        tiny check) · PLANNED → accent outline · MISSED →
//                        danger · SKIPPED → dashed grey · REST → NO dot.
//                        Projected ghost day-name (showProjectedDays) shows
//                        only on otherwise-empty cells. Selected cell = orange
//                        ring; today = orange date number.
//
// Range & virtualization: the caller passes the §6 range (min(earliest
// schedule entry, now-2 months) → now+3 months) — ~6 months ≈ 250 cells, so
// plain rendering is smooth (the Part 3 list-view precedent: virtualisation
// skipped by design at this size). Tap a day → the caller navigates to the
// §5.1 day-detail route (#/calendar/{date}); the selection highlight stays.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { todayKey } from "@/lib/client/format";
import { Check } from "lucide-react";
import type { ProjectedDayDTO, ScheduleEntryDTO } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { monthCells, monthLabelLong, weekdayLabels, type MonthAnchor } from "./month-utils";

const MAX_DOTS = 3;

type Props = {
  /** The §6 month range, oldest → newest (plain render — see header note). */
  months: MonthAnchor[];
  /** 0 = Sunday, 1 = Monday (user setting; legacy default 1). */
  weekStart: number;
  /** Day keys that carry a logged workout (cell affordance only — dots are §6 status dots). */
  workoutDays: Set<string>;
  /** Part 9 §6: ALL schedule entries of the range, indexed by day key. */
  entriesByDay: Map<string, ScheduleEntryDTO[]>;
  /** Part 5: projected ghost days (showProjectedDays), indexed by day key. */
  projectedByDay: Map<string, ProjectedDayDTO>;
  selectedDay: string;
  loading: boolean;
  onSelect: (dayKey: string) => void;
};

/** §6 dot for one schedule status (null = no dot: REST, future unknown). */
function scheduleDotClass(status: string): string | null {
  switch (status) {
    case "PLANNED":
      return "h-1.5 w-1.5 rounded-full border-[1.5px] border-primary bg-transparent";
    case "DONE":
      return "h-1.5 w-1.5 rounded-full bg-primary";
    case "MISSED":
      return "h-1.5 w-1.5 rounded-full bg-destructive";
    case "SKIPPED":
      return "h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/60 bg-transparent";
    default:
      return null;
  }
}

/** Stable DOM id for a month section (scroll-to-month target). */
export function monthId(anchor: MonthAnchor): string {
  return `cal-${anchor.year}-${anchor.month}`;
}

export function MonthView({
  months,
  weekStart,
  workoutDays,
  entriesByDay,
  projectedByDay,
  selectedDay,
  loading,
  onSelect,
}: Props) {
  const labels = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const today = todayKey();

  if (loading && entriesByDay.size === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading calendar">
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
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[344px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* weekday header — 32px single-line, muted (once, above all months) */}
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

      {months.map((anchor) => {
        const cells = monthCells(anchor, weekStart);
        return (
          <section key={`${anchor.year}-${anchor.month}`} aria-label={monthLabelLong(anchor)}>
            {/* sticky month header — 40px data-row */}
            <h3
              data-row
              className="sticky top-0 z-10 flex h-10 flex-none items-center justify-between overflow-hidden whitespace-nowrap rounded-lg border border-border bg-background/95 px-3 text-sm font-semibold backdrop-blur-sm"
            >
              <span className="truncate">{monthLabelLong(anchor)}</span>
            </h3>

            {/* 7-column grid — cells are exactly 40px (h-10) */}
            <div className="mt-2 grid grid-cols-7 gap-1" role="grid" aria-label="Month grid">
              {cells.map((dayKey, i) => {
                if (dayKey === null) {
                  return <div key={`blank-${i}`} aria-hidden className="h-10 rounded-lg" />;
                }
                const workout = workoutDays.has(dayKey);
                const entries = entriesByDay.get(dayKey) ?? [];
                const projected = projectedByDay.get(dayKey);
                const isToday = dayKey === today;
                const isSelected = dayKey === selectedDay;
                const dayNum = Number(dayKey.slice(8, 10));

                // §6 dots: schedule status only; REST entries render no dot.
                const dotEntries = entries.filter((e) => scheduleDotClass(e.status) != null);
                const markedOffDone = entries.some((e) => e.status === "DONE" && e.markedOff);
                const hasContent = workout || dotEntries.length > 0;

                const entrySummary =
                  entries.length === 1
                    ? `${entries[0].routineName}${entries[0].dayName ? ` · ${entries[0].dayName}` : ""} (${entries[0].status.toLowerCase()})`
                    : entries.length > 1
                      ? `${entries.length} entries`
                      : "";
                return (
                  <button
                    key={dayKey}
                    type="button"
                    data-day-cell={dayKey}
                    {...tourAttrs({ id: "calendar.dayCell", label: "Day cell", help: "Tap a day to see its sessions; dots mark their status.", order: 70 })}
                    aria-label={`${dayKey}${workout ? " — workout day" : ""}${entrySummary ? ` — ${entrySummary}` : ""}`}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(dayKey)}
                    className={cn(
                      "flex h-10 select-none flex-col items-start justify-between overflow-hidden rounded-lg border p-1 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : hasContent
                          ? "border-border/80 bg-card hover:border-primary/50 hover:bg-primary/5"
                          : "border-transparent bg-muted/25 hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-semibold leading-none tabular-nums",
                        isToday
                          ? "text-primary"
                          : hasContent
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {dayNum}
                    </span>
                    {dotEntries.length > 0 ? (
                      <span className="flex w-full items-center gap-1 overflow-hidden leading-none">
                        {dotEntries.slice(0, MAX_DOTS).map((e, di) => (
                          <span key={e.id} className="flex flex-none items-center leading-none">
                            <span className={cn(scheduleDotClass(e.status))} aria-hidden />
                            {di === 0 && e.status === "DONE" && markedOffDone ? (
                              <Check className="h-2 w-2 text-primary" strokeWidth={4} aria-hidden />
                            ) : null}
                          </span>
                        ))}
                        {dotEntries.length > MAX_DOTS ? (
                          <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                            +{dotEntries.length - MAX_DOTS}
                          </span>
                        ) : null}
                      </span>
                    ) : projected ? (
                      <span
                        className="w-full truncate text-[10px] font-medium leading-none text-muted-foreground/80"
                        title={`${projected.dayName} (projected)`}
                      >
                        {projected.dayName}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
