"use client";

// DateStrip — the Today SubBar content: `◄ [Thu 25 Sep] ►` + Today chip.
// Day math reuses the legacy helpers (@/lib/client/format addDaysKey/todayKey
// and ./day-utils for the react-day-picker ↔ day-key conversion); the tappable
// label opens a Calendar popover (date pickers are one of the two allowed
// dialog-style surfaces). Renders directly inside the 48px SubBar primitive.

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

export function DateStrip({
  dateKey,
  onChange,
  workoutExists = false,
}: {
  dateKey: string;
  onChange: (key: string) => void;
  workoutExists?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = keyToLocalDate(dateKey);
  const onToday = isToday(dateKey);

  return (
    <>
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
    </>
  );
}
