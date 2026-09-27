"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UpcomingStrip — section B of the Home dashboard (Part 5).
//
// One 48px row of 7 equal chips (tomorrow → +7 days from the dashboard's
// `upcoming` array): weekday letter + day number + a tiny label (day name, or
// "Rest" / "Scheduled"). Scheduled chips are outlined orange. Tap →
// #/calendar?date=YYYY-MM-DD (the calendar preselects the day).
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import type { DashboardUpcomingDayDTO } from "@/lib/types";
import { parseDayKey } from "@/lib/client/format";

function chipLabel(day: DashboardUpcomingDayDTO): string {
  if (day.kind === "SCHEDULED") return day.entry?.dayName ?? day.label ?? "Scheduled";
  if (day.kind === "REST") return "Rest";
  if (day.kind === "WORKOUT") return day.label ?? "Workout";
  return "–";
}

export function UpcomingStrip({ days }: { days: DashboardUpcomingDayDTO[] }) {
  const navigate = useApp((s) => s.navigate);
  if (days.length === 0) return null;

  return (
    <div
      data-row
      role="list"
      aria-label="Upcoming days"
      className="flex h-12 items-stretch gap-1 overflow-hidden whitespace-nowrap"
    >
      {days.slice(0, 7).map((day) => {
        const d = parseDayKey(day.date);
        const weekday = d.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
        const dayNum = d.getUTCDate();
        const scheduled = day.kind === "SCHEDULED";
        return (
          <button
            key={day.date}
            type="button"
            role="listitem"
            aria-label={`${day.date} — ${chipLabel(day)}`}
            onClick={() => navigate(`/calendar?date=${day.date}`)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1 transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              scheduled
                ? "border-primary/60 bg-primary/5 hover:bg-primary/10"
                : "border-border bg-card hover:bg-accent/40",
            )}
          >
            <span className="flex items-center gap-1 leading-none">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{weekday}</span>
              <span className="text-sm font-bold leading-none tabular-nums">{dayNum}</span>
            </span>
            <span
              className={cn(
                "w-full truncate text-center text-[9px] leading-none",
                scheduled ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {chipLabel(day)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
