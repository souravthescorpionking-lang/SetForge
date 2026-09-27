"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SchedulePickScreen — #/schedule/pick?date=YYYY-MM-DD (Part 5).
//
//   TopBar (56)  : [◀] "Schedule for {Fri 2 Oct}" (back → history.back)
//   SubBar (48)  : Tabs `Routines | Sessions` (controlled, default Routines)
//   ScrollBody   : ROUTINES — accordion (48px headers = routine name + chevron;
//                  expanded rows 48px "Day {k} · {name} · {m} exercises", REST
//                  days disabled + labelled). SESSIONS — 48px rows (name +
//                  exercise count). Tapping a workout-day/session row creates
//                  the schedule entry, then history.back() + toast with Undo.
//   409 CONFLICT → the shared Replace confirm → retry with replace:true.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronLeft, Dumbbell, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { routinesApi } from "@/lib/client/api";
import { qk } from "@/lib/client/query";
import { formatDayLabel } from "@/lib/client/format";
import { useHashRoute } from "@/features/shell/router";
import {
  goBackOrCalendar,
  useScheduleCreate,
  type ScheduleCreateArgs,
} from "./schedule-shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Tab = "routines" | "sessions";

export default function SchedulePickScreen() {
  const route = useHashRoute();
  const dateParam = route.name === "schedule-pick" ? route.query.get("date") : null;
  const dateKey = dateParam && DATE_RE.test(dateParam) ? dateParam : undefined;

  const [tab, setTab] = useState<Tab>("routines");
  const [openRoutineId, setOpenRoutineId] = useState<string | null>(null);
  const { create, conflictDialog } = useScheduleCreate();

  const { data, isLoading } = useQuery({
    queryKey: qk.routines,
    queryFn: () => routinesApi.list(),
  });

  const routines = useMemo(
    () =>
      [...(data?.routines ?? [])]
        .filter((r) => (r.kind ?? "ROUTINE") !== "SESSION")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data?.routines],
  );
  const sessions = useMemo(
    () =>
      [...(data?.routines ?? [])]
        .filter((r) => r.kind === "SESSION")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data?.routines],
  );

  /** Create + navigate back + toast (Undo comes from the shared hook). */
  const schedule = (args: Omit<ScheduleCreateArgs, "date" | "onSuccess"> & { date?: string }) => {
    const date = args.date ?? dateKey ?? new Date().toISOString().slice(0, 10);
    void create({
      ...args,
      date,
      onSuccess: () => goBackOrCalendar(date),
    });
  };

  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "#/calendar";
  };

  return (
    <Screen
      topBar={
        <TopBar
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              aria-label="Back"
              onClick={back}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={dateKey ? `Schedule for ${formatDayLabel(dateKey)}` : "Schedule a workout"}
        />
      }
      subBar={
        <SubBar>
          <div role="tablist" aria-label="Program kind" className="flex h-11 w-full items-center gap-2">
            {(["routines", "sessions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-lg border text-sm font-bold capitalize transition-colors",
                  tab === t
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/40",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </SubBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading programs">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : tab === "routines" ? (
          routines.length === 0 ? (
            <div
              data-row
              className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
            >
              No routines yet — create one under Programs
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {routines.map((routine) => {
                const open = openRoutineId === routine.id;
                const days = [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder);
                return (
                  <section
                    key={routine.id}
                    className="flex flex-none flex-col overflow-hidden rounded-lg border bg-card"
                    aria-label={routine.name}
                  >
                    <button
                      type="button"
                      data-row
                      aria-expanded={open}
                      onClick={() => setOpenRoutineId(open ? null : routine.id)}
                      className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !open && "-rotate-90")}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                        {routine.name}
                      </span>
                      <span className="flex-none text-xs text-muted-foreground">
                        {days.length} {days.length === 1 ? "day" : "days"}
                      </span>
                    </button>
                    {open ? (
                      <div className="flex flex-col border-t border-border/50">
                        {days.map((day, i) => {
                          const isRest = (day.dayType ?? "WORKOUT") === "REST";
                          const exCount = day.exercises.length;
                          return (
                            <button
                              key={day.id}
                              type="button"
                              data-row
                              disabled={isRest || !dateKey}
                              aria-label={
                                isRest
                                  ? `Day ${i + 1} ${day.name} — rest day`
                                  : `Schedule ${routine.name} · ${day.name} for ${dateKey ?? "the picked date"}`
                              }
                              onClick={() =>
                                schedule({
                                  routineId: routine.id,
                                  dayId: day.id,
                                  toastLabel: `Scheduled ${routine.name} · ${day.name} for ${
                                    dateKey ? formatDayLabel(dateKey) : "today"
                                  }`,
                                })
                              }
                              className={cn(
                                "flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/30 px-3 text-left text-sm transition-colors last:border-b-0",
                                isRest
                                  ? "cursor-default text-muted-foreground/60"
                                  : "hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
                              )}
                            >
                              <span className="w-14 flex-none text-xs font-semibold text-muted-foreground">
                                Day {i + 1}
                              </span>
                              {isRest ? (
                                <Moon className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
                              ) : (
                                <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
                              )}
                              <span className={cn("min-w-0 flex-1 truncate", !isRest && "font-medium")}>
                                {day.name}
                              </span>
                              <span className="flex-none text-xs text-muted-foreground">
                                {isRest ? "Rest" : `${exCount} ${exCount === 1 ? "exercise" : "exercises"}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )
        ) : sessions.length === 0 ? (
          <div
            data-row
            className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
          >
            No sessions yet — save one from a finished workout
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((session) => {
              const exCount = session.days.reduce((n, d) => n + d.exercises.length, 0);
              return (
                <button
                  key={session.id}
                  type="button"
                  data-row
                  disabled={!dateKey}
                  aria-label={`Schedule session ${session.name} for ${dateKey ?? "the picked date"}`}
                  onClick={() =>
                    schedule({
                      routineId: session.id,
                      toastLabel: `Scheduled ${session.name} for ${
                        dateKey ? formatDayLabel(dateKey) : "today"
                      }`,
                    })
                  }
                  className="flex h-12 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Dumbbell className="h-4 w-4 flex-none text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                    {session.name}
                  </span>
                  <span className="flex-none text-xs text-muted-foreground">
                    {exCount} {exCount === 1 ? "exercise" : "exercises"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!dateKey ? (
          <div
            role="status"
            className="flex h-12 flex-none items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-xs text-muted-foreground"
          >
            No date picked — open this screen via Schedule… on a program or a calendar day.
          </div>
        ) : null}

        {conflictDialog}
      </ScrollBody>
    </Screen>
  );
}
