"use client";

// Custom month grid (no react-day-picker — cells need rich workout content).
// UTC day-key math only; week start comes from user settings.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { dayKeyOf, todayKey, formatMonthYear } from "@/lib/client/format";
import type { WorkoutSummaryDTO } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export type MonthAnchor = { year: number; month: number }; // month 0-11 (UTC)

const MAX_DOTS = 4;

/** Cells for one month: null = outside the month (leading/trailing blank). */
function monthCells(anchor: MonthAnchor, weekStart: number): Array<string | null> {
  const first = new Date(Date.UTC(anchor.year, anchor.month, 1));
  const last = new Date(Date.UTC(anchor.year, anchor.month + 1, 0));
  const firstDow = first.getUTCDay(); // 0 = Sunday
  const leading = (firstDow - weekStart + 7) % 7;
  const daysInMonth = last.getUTCDate();
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(dayKeyOf(new Date(Date.UTC(anchor.year, anchor.month, d))));
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

/** Weekday header labels respecting the week-start setting. */
function weekdayLabels(weekStart: number): string[] {
  const labels: string[] = [];
  // 2024-01-07 was a Sunday (UTC)
  for (let i = 0; i < 7; i++) {
    const dow = (weekStart + i) % 7;
    labels.push(
      new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(undefined, {
        weekday: "short",
        timeZone: "UTC",
      }),
    );
  }
  return labels;
}

type Props = {
  anchor: MonthAnchor;
  weekStart: number;
  byDay: Map<string, WorkoutSummaryDTO>;
  selectedDay: string | null;
  onSelect: (dayKey: string) => void;
  singleDot: boolean;
  loading: boolean;
  direction: number; // -1 prev, +1 next, for the slide animation
};

export function MonthGrid({
  anchor,
  weekStart,
  byDay,
  selectedDay,
  onSelect,
  singleDot,
  loading,
  direction,
}: Props) {
  const cells = useMemo(() => monthCells(anchor, weekStart), [anchor, weekStart]);
  const labels = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const today = todayKey();

  if (loading && byDay.size === 0) {
    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-7 gap-1.5">
          {labels.map((l) => (
            <div key={l} className="h-5" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="min-h-16 sm:min-h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key={`${anchor.year}-${anchor.month}`}
      initial={{ opacity: 0, x: direction * 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {labels.map((l) => (
          <div
            key={l}
            className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((dayKey, i) => {
          if (dayKey === null) {
            return <div key={`blank-${i}`} aria-hidden className="min-h-16 sm:min-h-20" />;
          }
          const workout = byDay.get(dayKey);
          const isToday = dayKey === today;
          const isSelected = dayKey === selectedDay;
          const dayNum = Number(dayKey.slice(8, 10));
          const cats = workout ? dedupeCategories(workout) : [];
          return (
            <button
              key={dayKey}
              type="button"
              aria-label={`${dayKey}${workout ? " — workout day" : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onClick={() => onSelect(dayKey)}
              className={cn(
                "group relative flex min-h-16 sm:min-h-20 flex-col items-start rounded-xl border p-1.5 sm:p-2 text-left transition-colors",
                "touch-manipulation select-none",
                isSelected
                  ? "border-primary bg-primary/15"
                  : workout
                    ? "border-border/80 bg-card hover:border-primary/50 hover:bg-primary/5"
                    : "border-transparent bg-muted/25 hover:bg-muted/50",
                isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              <span
                className={cn(
                  "numeric text-xs font-semibold sm:text-sm",
                  isToday ? "text-primary" : workout ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {dayNum}
              </span>
              {workout && (
                <span className="mt-auto flex w-full flex-wrap items-center gap-x-1 gap-y-1 pt-1">
                  {singleDot ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: cats[0]?.colour ?? "var(--muted-foreground)" }}
                      aria-hidden
                    />
                  ) : (
                    <>
                      {cats.slice(0, MAX_DOTS).map((c) => (
                        <span
                          key={c.name}
                          title={c.name}
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.colour }}
                          aria-hidden
                        />
                      ))}
                      {cats.length > MAX_DOTS && (
                        <span className="numeric text-[10px] font-semibold text-muted-foreground">
                          +{cats.length - MAX_DOTS}
                        </span>
                      )}
                    </>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {formatMonthYear(new Date(Date.UTC(anchor.year, anchor.month, 1)))}
      </p>
    </motion.div>
  );
}

function dedupeCategories(w: WorkoutSummaryDTO): Array<{ name: string; colour: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; colour: string }> = [];
  for (const c of w.categories) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}
