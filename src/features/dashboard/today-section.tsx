"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodaySection — the §7 Dashboard "Today" block: today's ScheduleEntry rows
// in a shared renderer shape ("{program}: {day name}" + status line, 4px L4
// status bar, tap → the session's log / day / program). Empty 56 row:
// "Nothing scheduled today." + "Schedule" → #/schedule/pick.
//
// The §5.1 day-detail rows live in features/calendar (another agent); this is
// the Dashboard's minimal today-view of the same ScheduleEntry data — same
// status colours, same tap targets.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useSchedule } from "@/lib/client/query";
import { stepsApi } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { ScheduleEntryDTO, StepsResponseDTO } from "@/lib/types";

/** L4 status colours — the 4px left bar is the ONLY status colour. */
function statusBarClass(status: string): string {
  switch (status) {
    case "DONE":
      return "bg-primary";
    case "PLANNED":
      return "bg-primary/40";
    case "MISSED":
      return "bg-destructive/70";
    default:
      return "bg-muted-foreground/40";
  }
}

function statusLine(entry: ScheduleEntryDTO): string {
  switch (entry.status) {
    case "DONE":
      return entry.markedOff ? "Marked off" : "Done";
    case "MISSED":
      return "Missed";
    case "SKIPPED":
      return "Skipped";
    default:
      return entry.timeOfDay ? `At ${entry.timeOfDay}` : "Scheduled";
  }
}

function TodayRow({ entry }: { entry: ScheduleEntryDTO }) {
  const navigate = useApp((s) => s.navigate);
  const label = `${entry.routineName}${entry.dayName ? `: ${entry.dayName}` : ""}`;
  const status = statusLine(entry);
  const target = entry.workoutId
    ? `/logs/${entry.workoutId}`
    : entry.dayId
      ? `/days/${entry.dayId}`
      : `/programs/${entry.routineId}`;

  return (
    <button
      type="button"
      data-row
      {...tourAttrs({
        id: "dashboard.todayRow",
        label: "Today's session",
        help: "A session scheduled today. Tap to open its log, day or program.",
        order: 30,
      })}
      onClick={() => navigate(target)}
      aria-label={`${label} — ${status}`}
      className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className={cn("h-4 w-1 flex-none rounded-full", statusBarClass(entry.status))} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
      <span
        className={cn(
          "flex-none text-xs leading-none",
          entry.status === "MISSED" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {status}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
    </button>
  );
}

export function TodaySection({ today }: { today: string }) {
  const navigate = useApp((s) => s.navigate);
  const scheduleQuery = useSchedule(today, today);
  const entries = useMemo(
    () => scheduleQuery.data?.entries ?? [],
    [scheduleQuery.data],
  );

  return (
    <>
      <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap px-1">
        <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">Today</p>
        <button
          type="button"
          {...tourAttrs({
            id: "dashboard.todayCalendar",
            label: "Calendar",
            help: "Open the month calendar.",
            order: 20,
          })}
          onClick={() => navigate("/calendar")}
          className="flex h-8 flex-none items-center gap-1 rounded-md text-xs font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">Calendar</span>
          <ChevronRight className="h-3.5 w-3.5 flex-none" aria-hidden />
        </button>
      </div>
      {scheduleQuery.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading today's schedule">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <div
          data-row
          className="flex h-14 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Nothing scheduled today.
          </span>
          <button
            type="button"
            {...tourAttrs({
              id: "dashboard.todaySchedule",
              label: "Schedule",
              help: "Pick a program day or session to schedule today.",
              order: 40,
            })}
            onClick={() => navigate(`/schedule/pick?date=${today}`)}
            className="flex h-9 flex-none items-center rounded-md px-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Schedule
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <TodayRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </>
  );
}

// Re-exported for the Stats tiles: the today steps query (§7 tile + §8.3).
export function useTodaySteps(today: string) {
  return useQuery({
    queryKey: qk.steps(today, today),
    queryFn: (): Promise<StepsResponseDTO> => stepsApi.list({ from: today, to: today }),
    staleTime: 30_000,
  });
}
