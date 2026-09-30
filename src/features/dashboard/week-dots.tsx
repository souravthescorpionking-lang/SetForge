"use client";

// ─────────────────────────────────────────────────────────────────────────────
// WeekDots — the 32px Mon–Sun activity strip of "This week" (Part 8 §3.2).
//
//   ●  filled          a workout was logged that day
//   ◉  accent          TODAY (accent ring; filled accent when also done)
//   ○  hollow ring     planned (schedule entry with status PLANNED)
//   ◔  half-filled     missed (schedule entry MISSED/SKIPPED)
//   ◦  muted ring      rest day (projected REST day of the followed program)
//   ·  tiny muted dot  nothing
//
// Data: `workoutsApi.list({from,to})` for logged days + `useSchedule(from,to)`
// for PLANNED/MISSED entries and projected REST ghosts. The week window starts
// on the user's weekStart setting (default Monday) around the server-resolved
// today date. Non-interactive (tooltip per dot + a summary aria-label).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { qk, useSchedule } from "@/lib/client/query";
import { workoutsApi } from "@/lib/client/api";
import { addDaysKey, dayKeyOf, formatDayLabel, parseDayKey } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import type { ProjectedDayDTO, ScheduleEntryDTO } from "@/lib/types";

type DotState = "done" | "planned" | "missed" | "rest" | "none";

type Dot = {
  key: string;
  state: DotState;
  isToday: boolean;
  /** Tooltip + sr label, e.g. "Mon 28 Sep · Workout done". */
  label: string;
};

const STATE_WORD: Record<DotState, string> = {
  done: "Workout done",
  planned: "Planned",
  missed: "Missed",
  rest: "Rest day",
  none: "No activity",
};

function dotClasses(dot: Dot): string {
  if (dot.isToday && dot.state === "done") {
    // today + logged → filled accent
    return "h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/30";
  }
  if (dot.isToday) {
    // today marker → accent ring (◉)
    return "h-2.5 w-2.5 rounded-full border-2 border-primary";
  }
  switch (dot.state) {
    case "done":
      return "h-2.5 w-2.5 rounded-full bg-foreground";
    case "planned":
      return "h-2.5 w-2.5 rounded-full border-2 border-foreground/60";
    case "missed":
      // ◔ — left half filled
      return "h-2.5 w-2.5 rounded-full border border-foreground/60 bg-[linear-gradient(90deg,var(--foreground)_50%,transparent_50%)]";
    case "rest":
      return "h-2 w-2 rounded-full border border-muted-foreground/60";
    default:
      return "h-1 w-1 rounded-full bg-muted-foreground/50";
  }
}

export function WeekDots({ today, weekStart, ready }: { today: string; weekStart: number; ready: boolean }) {
  // 7 day keys of the week containing `today` (weekStart: 0=Sun, 1=Mon).
  const weekDays = useMemo(() => {
    const dow = parseDayKey(today).getUTCDay();
    const lead = (dow - weekStart + 7) % 7;
    const first = addDaysKey(today, -lead);
    return Array.from({ length: 7 }, (_, i) => addDaysKey(first, i));
  }, [today, weekStart]);
  const from = weekDays[0];
  const to = weekDays[6];

  const workoutsQuery = useQuery({
    queryKey: qk.workoutList({ from, to }),
    queryFn: () => workoutsApi.list({ from, to }),
    enabled: ready,
  });
  const scheduleQuery = useSchedule(from, to);

  const dots = useMemo<Dot[]>(() => {
    // A workout existing on a date marks the day as done (same semantic as the
    // calendar month grid: planned-but-unlogged sets still count as a session).
    const logged = new Set<string>();
    for (const w of workoutsQuery.data?.workouts ?? []) logged.add(dayKeyOf(w.date));
    const entryByDay = new Map<string, ScheduleEntryDTO>();
    for (const e of scheduleQuery.data?.entries ?? []) {
      const prev = entryByDay.get(e.date);
      // prefer PLANNED entries when several land on one day
      if (!prev || (e.status === "PLANNED" && prev.status !== "PLANNED")) entryByDay.set(e.date, e);
    }
    const projectedByDay = new Map<string, ProjectedDayDTO>();
    for (const p of scheduleQuery.data?.projected ?? []) projectedByDay.set(p.date, p);

    return weekDays.map((key) => {
      const entry = entryByDay.get(key);
      let state: DotState = "none";
      if (logged.has(key) || entry?.status === "DONE") state = "done";
      else if (entry && (entry.status === "MISSED" || entry.status === "SKIPPED")) state = "missed";
      else if (entry?.status === "PLANNED") state = "planned";
      else if (projectedByDay.get(key)?.dayType === "REST") state = "rest";
      const isToday = key === today;
      return {
        key,
        state,
        isToday,
        label: `${formatDayLabel(key)} · ${isToday ? `Today · ${STATE_WORD[state]}` : STATE_WORD[state]}`,
      };
    });
  }, [weekDays, today, workoutsQuery.data, scheduleQuery.data]);

  if (!ready || workoutsQuery.isLoading || scheduleQuery.isLoading) {
    return <Skeleton className="h-8 w-full rounded-lg" aria-busy="true" aria-hidden />;
  }

  const summary = dots
    .map((d) => `${formatDayLabel(d.key)}: ${d.isToday ? `today, ${STATE_WORD[d.state].toLowerCase()}` : STATE_WORD[d.state].toLowerCase()}`)
    .join(", ");

  return (
    <div
      data-row
      role="img"
      aria-label={`Week activity — ${summary}`}
      className="flex h-8 w-full items-center overflow-hidden whitespace-nowrap px-1"
    >
      <div className="grid w-full grid-cols-7">
        {dots.map((d) => (
          <span key={d.key} title={d.label} className="flex items-center justify-center">
            <span aria-hidden className={cn("flex-none", dotClasses(d))} />
          </span>
        ))}
      </div>
    </div>
  );
}
