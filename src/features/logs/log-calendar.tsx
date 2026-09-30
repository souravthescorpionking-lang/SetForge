"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LogCalendar — the §8 calendar mode of #/logs?view=calendar.
//
// A compact month grid (40px cells) built ENTIRELY client-side from the loaded
// (and already search/dayId-filtered) log list — no extra API. Pure month math
// is reused from features/calendar/month-utils (import-only; the calendar
// feature itself is owned by the parallel §6 agent).
//
//   nav row (40)   : ◀ [Sep 2026] ▶ — month paging, arrows are 40px buttons
//   weekday header : 32px · 7 columns · muted uppercase
//   grid           : 7×6 cells (fixed 42 slots), cells exactly 40px (h-10)
//   cell           : day number + accent dot ONLY for days having logs;
//                    days whose logs match the ?dayId filter get emphasis
//                    (primary ring); days without logs are inert.
//   tap a day      : DropdownMenu of that day's logs (name + duration) —
//                    tapping an entry opens #/logs/{id}.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { dayKeyOf, formatDurationParts, todayKey } from "@/lib/client/format";
import {
  monthCells,
  monthLabelShort,
  monthOf,
  shiftAnchor,
  weekdayLabels,
  type MonthAnchor,
} from "@/features/calendar/month-utils";
import { logRowName } from "./log-shared";
import type { WorkoutSummaryDTO } from "@/lib/types";

type Props = {
  /** The filtered log list (server already applied search + ?dayId). */
  workouts: WorkoutSummaryDTO[];
  /** Active ?dayId filter — days with matching logs get emphasis. */
  emphasisedDayId: string | null;
  /** 0 = Sunday, 1 = Monday (user setting; default 1). */
  weekStart: number;
  loading: boolean;
  onOpenLog: (workoutId: string) => void;
};

export function LogCalendar({ workouts, emphasisedDayId, weekStart, loading, onOpenLog }: Props) {
  // anchor: month of the newest log (list is date-desc); current month when empty
  const [anchor, setAnchor] = useState<MonthAnchor>(() =>
    workouts.length > 0 ? monthOf(dayKeyOf(workouts[0].date)) : monthOf(todayKey()),
  );
  const cells = useMemo(() => monthCells(anchor, weekStart), [anchor, weekStart]);
  const labels = useMemo(() => weekdayLabels(weekStart), [weekStart]);

  // day key → that day's logs (dots + tap menus)
  const byDay = useMemo(() => {
    const m = new Map<string, WorkoutSummaryDTO[]>();
    for (const w of workouts) {
      const key = dayKeyOf(w.date);
      const list = m.get(key);
      if (list) list.push(w);
      else m.set(key, [w]);
    }
    return m;
  }, [workouts]);

  const today = todayKey();

  if (loading && workouts.length === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading log calendar">
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted/50" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }, (_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* month nav — 40px row, arrows are 40px square buttons */}
      <div data-row className="flex h-10 w-full items-center gap-1 overflow-hidden whitespace-nowrap">
        <button
          type="button"
          {...tourAttrs({ id: "logs.calendarPrev", label: "Previous month", help: "Page the log calendar back one month.", order: 70 })}
          aria-label={`Previous month (${monthLabelShort(shiftAnchor(anchor, -1))})`}
          onClick={() => setAnchor((a) => shiftAnchor(a, -1))}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-bold uppercase tracking-wide">
          {monthLabelShort(anchor)}
        </p>
        <button
          type="button"
          {...tourAttrs({ id: "logs.calendarNext", label: "Next month", help: "Page the log calendar forward one month.", order: 80 })}
          aria-label={`Next month (${monthLabelShort(shiftAnchor(anchor, 1))})`}
          onClick={() => setAnchor((a) => shiftAnchor(a, 1))}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* weekday header — 32px, not a data-row */}
      <div className="grid grid-cols-7 gap-1" aria-hidden="true">
        {labels.map((l) => (
          <div
            key={l}
            className="flex h-8 items-center justify-center overflow-hidden text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {l}
          </div>
        ))}
      </div>

      {/* fixed 7×6 grid — cells exactly 40px */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Logs by month">
        {cells.map((dayKey, i) => {
          if (dayKey === null) {
            return <div key={`blank-${i}`} aria-hidden className="h-10 rounded-lg" />;
          }
          const dayLogs = byDay.get(dayKey) ?? [];
          const hasLogs = dayLogs.length > 0;
          const emphasised = emphasisedDayId != null && dayLogs.some((l) => l.dayId === emphasisedDayId);
          const isToday = dayKey === today;
          const dayNum = Number(dayKey.slice(8, 10));

          if (!hasLogs) {
            return (
              <div
                key={dayKey}
                aria-hidden
                className={cn(
                  "flex h-10 select-none flex-col items-center justify-center rounded-lg bg-muted/25 text-[11px] tabular-nums text-muted-foreground/40",
                  isToday && "text-muted-foreground/70",
                )}
              >
                {dayNum}
              </div>
            );
          }

          // tap a day with logs → menu of that day's sessions → open one
          return (
            <DropdownMenu key={dayKey}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  {...tourAttrs({ id: "logs.calendarCell", label: "Day cell", help: "Dots mark days you trained; tap for that day's sessions.", order: 90 })}
                  aria-label={`${dayKey} — ${dayLogs.length} session${dayLogs.length === 1 ? "" : "s"}`}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex h-10 select-none flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    emphasised
                      ? "border-primary bg-primary/10 ring-2 ring-primary/40 hover:bg-primary/15"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-semibold leading-none tabular-nums",
                      isToday ? "text-primary" : "text-foreground",
                    )}
                  >
                    {dayNum}
                  </span>
                  <span aria-hidden className="flex items-center gap-0.5">
                    {dayLogs.slice(0, 3).map((l) => (
                      <span key={l.id} className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ))}
                    {dayLogs.length > 3 ? (
                      <span className="text-[9px] font-bold leading-none text-primary">+{dayLogs.length - 3}</span>
                    ) : null}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                {dayLogs.map((l) => (
                  <DropdownMenuItem
                    key={l.id}
                    {...tourAttrs({ skipTour: true, reason: "Data-driven day-menu entries generated from the log list" })}
                    className="justify-between gap-3"
                    aria-label={`Open ${logRowName(l)}`}
                    onClick={() => onOpenLog(l.id)}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{logRowName(l)}</span>
                    <span className="flex-none text-[11px] tabular-nums text-muted-foreground">
                      {formatDurationParts(l.durationSec)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </div>
  );
}
