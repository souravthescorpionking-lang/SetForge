"use client";

// DateStrip — the Today SubBar: `◄ [Thu 25 Sep] ►` + Today chip, plus the
// §4.11 sets-progress bar (a 4px full-width bar pinned to the SubBar's bottom
// edge — absolute inside the container, NO extra height).
//
// FIX (6-e): this component now renders its own 48px SubBar-shaped container
// (same classes as the SubBar primitive + `relative` for the progress pin).
// Previously it returned a bare FRAGMENT, so its buttons were spliced as
// direct children of the Screen flex COLUMN (stacked vertically, date button
// stretching to ~358px) — a layout bug present since p3-3, exposed while
// wiring the progress bar (which needs a positioned ancestor).
//
// Day math reuses the legacy helpers (@/lib/client/format addDaysKey/todayKey
// and ./day-utils for the react-day-picker ↔ day-key conversion); the tappable
// label opens a Calendar popover (date pickers are one of the two allowed
// dialog-style surfaces).

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysKey, isToday, todayKey } from "@/lib/client/format";
import { dateToLocalKey, keyToLocalDate } from "./day-utils";

/** "Sat 26 Sep" — weekday · day · month, locale-aware, comma-free (spec shape). */
function formatDateStripLabel(key: string): string {
  const d = keyToLocalDate(key);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString(
    undefined,
    { month: "short" },
  )}`;
}

/** §4.11 sets progress: completed non-warmup performed sets / total sets. */
export interface SetsProgress {
  completed: number;
  total: number;
}

export function DateStrip({
  dateKey,
  onChange,
  workoutExists = false,
  progress = null,
}: {
  dateKey: string;
  onChange: (key: string) => void;
  workoutExists?: boolean;
  /** 4px progress bar pinned to the SubBar bottom edge; null/0-total hides it. */
  progress?: SetsProgress | null;
}) {
  const [open, setOpen] = useState(false);
  const selected = keyToLocalDate(dateKey);
  const onToday = isToday(dateKey);
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.max(0, (progress.completed / progress.total) * 100))
      : 0;

  return (
    <div
      data-subbar
      role="group"
      aria-label="Date strip"
      className="relative flex h-12 flex-none items-center gap-2 border-b border-border px-4"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Previous day"
        className="h-11 w-11 flex-none rounded-lg"
        onClick={() => onChange(addDaysKey(dateKey, -1))}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold tabular-nums transition-colors hover:border-primary/50 hover:bg-accent"
            aria-label={`Pick a date (currently ${formatDateStripLabel(dateKey)})`}
          >
            <span className="truncate">{formatDateStripLabel(dateKey)}</span>
            {workoutExists && (
              <span
                className="h-2 w-2 flex-none rounded-full bg-primary"
                aria-label="Workout on this day"
              />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            weekStartsOn={1}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(dateToLocalKey(d));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Next day"
        className="h-11 w-11 flex-none rounded-lg"
        onClick={() => onChange(addDaysKey(dateKey, 1))}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Button>

      <button
        type="button"
        onClick={() => {
          if (!onToday) onChange(todayKey());
        }}
        aria-label={onToday ? "Viewing today" : "Jump to today"}
        aria-current={onToday ? "date" : undefined}
        className={cn(
          "flex h-11 flex-none items-center rounded-full border px-3 text-xs font-bold uppercase tracking-wide",
          onToday
            ? "cursor-default border-border bg-muted/40 text-muted-foreground"
            : "border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20",
        )}
      >
        Today
      </button>

      {/* §4.11 sets progress — 4px, full-width, pinned to the bottom edge */}
      {progress && progress.total > 0 ? (
        <div
          className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted/70"
          role="progressbar"
          aria-label="Workout sets progress"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          aria-valuetext={`${progress.completed} of ${progress.total} sets done`}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
