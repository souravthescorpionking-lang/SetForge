"use client";

// Day-key date picker field (Popover + Calendar). Workout dates are yyyy-mm-dd
// UTC day keys; the calendar works in local dates so we convert at the boundary.
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { formatDayLabel } from "@/lib/client/format";
import { cn } from "@/lib/utils";

function keyToLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function localDateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  value: string | null;
  onChange: (dayKey: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
};

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  ariaLabel = "Pick date",
  align = "start",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-10 justify-start gap-2 font-normal numeric",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 text-primary shrink-0" />
          {value ? formatDayLabel(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={value ? keyToLocalDate(value) : undefined}
          defaultMonth={value ? keyToLocalDate(value) : undefined}
          onSelect={(d) => {
            if (!d) return;
            onChange(localDateToKey(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
