"use client";

// ─────────────────────────────────────────────────────────────────────────────
// week-strip.tsx — the §8.2 weigh-in week strip.
//
//   Row 56: [◀] Mon Tue Wed Thu Fri Sat Sun [▶]   (7 × h-10 cells, flex-1)
//   Cells show the weekday initial + day number; the selected day is
//   highlighted; FUTURE days are dimmed and toast "Can't log a future date"
//   (the shared future guard). ◀ / ▶ page the strip one week at a time
//   (always containing the selected day).
//
//   Chips row 32 (below the strip): Yesterday · Today.
//
// Day keys are LOCAL wall-clock (body entries) — dateToLocalKey semantics.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { addDaysKey, parseDayKey } from "@/lib/client/format";
import { cn } from "@/lib/utils";

function localKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayLocalKey(): string {
  return localKey(new Date());
}

/** Monday-based week start (ISO) of a local day key. */
function weekStartOf(key: string): string {
  const d = new Date(`${key}T00:00`);
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysKey(key, -back);
}

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function WeekStrip({
  selected,
  onSelect,
}: {
  /** Local yyyy-mm-dd of the selected day. */
  selected: string;
  onSelect: (dayKey: string) => void;
}) {
  const today = todayLocalKey();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(selected));

  // keep the strip containing the selected day when the selection jumps
  // (e.g. the Yesterday/Today chips or a deep-linked ?date=)
  const effectiveStart = useMemo(() => {
    const end = addDaysKey(weekStart, 6);
    return selected < weekStart || selected > end ? weekStartOf(selected) : weekStart;
  }, [weekStart, selected]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysKey(effectiveStart, i)),
    [effectiveStart],
  );

  const cell = (key: string, idx: number) => {
    const future = key > today;
    const active = key === selected;
    const d = parseDayKey(key);
    const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
    return (
      <button
        key={key}
        type="button"
        aria-label={`${weekday} ${d.getUTCDate()}${active ? " (selected)" : future ? " (unavailable)" : ""}`}
        aria-pressed={active}
        aria-disabled={future}
        {...tourAttrs({ id: "progressLog.weekDay", label: "Week day", help: "Pick the weigh-in's day; future days can't be logged.", order: 20 })}
        onClick={() => {
          if (future) {
            toast.info("Can't log a future date");
            return;
          }
          onSelect(key);
        }}
        className={cn(
          "flex h-10 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border text-center leading-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active
            ? "border-primary/60 bg-primary/10 text-primary"
            : future
              ? "border-border/60 bg-muted/30 text-muted-foreground/40"
              : "border-border bg-card text-foreground hover:bg-accent/40",
        )}
      >
        <span className="text-[9px] font-bold uppercase tracking-wide">{WEEKDAY_INITIALS[idx]}</span>
        <span className="text-sm font-semibold tabular-nums">{d.getUTCDate()}</span>
      </button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex w-full items-center gap-1">
        <button
          type="button"
          aria-label="Previous week"
          {...tourAttrs({ id: "progressLog.prevWeek", label: "Previous week", help: "Page the week strip back one week.", order: 10 })}
          onClick={() => setWeekStart(addDaysKey(effectiveStart, -7))}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1" role="group" aria-label="Weigh-in week">
          {days.map((key, idx) => cell(key, idx))}
        </div>
        <button
          type="button"
          aria-label="Next week"
          {...tourAttrs({ id: "progressLog.nextWeek", label: "Next week", help: "Page the week strip forward one week.", order: 20 })}
          onClick={() => setWeekStart(addDaysKey(effectiveStart, 7))}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex w-full items-center gap-2" role="group" aria-label="Quick day picks">
        <QuickChip
          label="Yesterday"
          active={selected === addDaysKey(today, -1)}
          tour={{ id: "progressLog.chipYesterday", label: "Yesterday chip", help: "Jump to yesterday's weigh-in.", order: 30 }}
          onClick={() => onSelect(addDaysKey(today, -1))}
        />
        <QuickChip
          label="Today"
          active={selected === today}
          tour={{ id: "progressLog.chipToday", label: "Today chip", help: "Jump to today's weigh-in.", order: 30 }}
          onClick={() => onSelect(today)}
        />
      </div>
    </div>
  );
}

function QuickChip({
  label,
  active,
  onClick,
  tour,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tour: TourDecl;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...tourAttrs(tour)}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border px-3 text-xs font-semibold leading-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent/40",
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
