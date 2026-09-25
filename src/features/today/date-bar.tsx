"use client";

// Day navigation bar: prev/next buttons, tappable date label with calendar
// popover, and a "Today" shortcut chip when not on today.
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysKey, formatDayLabel, isToday, todayKey } from "@/lib/client/format";
import { dateToLocalKey, keyToLocalDate } from "./day-utils";

export function DateBar({
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

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous day"
        className="h-11 w-11 rounded-xl shrink-0"
        onClick={() => onChange(addDaysKey(dateKey, -1))}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="group flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-3 font-semibold transition-colors hover:border-primary/50 hover:bg-accent"
            aria-label="Pick a date"
          >
            <CalendarDays className="h-4.5 w-4.5 shrink-0 text-primary" />
            <span className="truncate text-sm sm:text-base">{formatDayLabel(dateKey)}</span>
            {workoutExists && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Workout on this day" />}
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
        variant="outline"
        size="icon"
        aria-label="Next day"
        className="h-11 w-11 rounded-xl shrink-0"
        onClick={() => onChange(addDaysKey(dateKey, 1))}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>

      {!isToday(dateKey) && (
        <Badge
          variant="secondary"
          className="h-9 cursor-pointer select-none gap-1 rounded-xl border-primary/40 bg-primary/10 px-3 text-primary hover:bg-primary/20"
          onClick={() => onChange(todayKey())}
        >
          <CalendarDays className="h-3.5 w-3.5" /> Today
        </Badge>
      )}
    </div>
  );
}
