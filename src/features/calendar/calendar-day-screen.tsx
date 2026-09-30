"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CalendarDayScreen — #/calendar/{yyyy-mm-dd} (Part 10 §5.1 day detail).
//
//   TopBar (56)  : BackButton (→ #/calendar?view=month&date={date}) ·
//                  "{Weekday}, {Mon} {d}" (e.g. "Wednesday, Sep 30")
//   ScrollBody   : 56px rows per entry on the date (own fetch —
//                  GET /api/schedule?date= runs the same lazy MISSED
//                  derivation the calendar grid relies on):
//                    COMPLETE  "{program}: {day name}" · "✓ Completed ·
//                              {duration}" → #/logs/{workoutId}
//                    SCHEDULED "{name}" · "Scheduled" → #/days/{dayId}
//                              (routine detail when the entry has no day);
//                              trailing ⋮ → ActionList "Unschedule"
//                              (confirm modal → DELETE the entry)
//                    MISSED    "{name}" · "Missed" → tap opens the ActionList:
//                              Do it today (creates today's entry — the shared
//                              useScheduleCreate conflict/Undo flow) ·
//                              Reschedule (shared DatePickerDialog + §5.2
//                              quick-jump chips → POST /reschedule) ·
//                              Dismiss (POST /dismiss → SKIPPED)
//                    REST      "Rest day" · "—" (not tappable)
//                    SKIPPED   "{name}" · "Skipped" (muted, not tappable)
//                  Unlinked logged workouts list as extra COMPLETE rows.
//                  Empty: "Nothing on this day."
//   BottomBar    : "Schedule a workout" → #/schedule/pick?date={date}
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
import { ActionList } from "@/components/shared/action-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarPlus, Check, ChevronRight, MoreVertical, Moon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { ApiError, scheduleApi, workoutsApi } from "@/lib/client/api";
import { formatDayHeading, formatDayLabel, formatDurationParts, todayKey } from "@/lib/client/format";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import type { ScheduleEntryDTO, WorkoutSummaryDTO } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ROW_BASE =
  "flex h-14 w-full min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2";

/** L4 status bar colours — the 4px left bar is the ONLY status colour. */
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

/** "{program}: {day name}" — the §5.1 COMPLETE label (day name falls back). */
function completeLabel(entry: ScheduleEntryDTO): string {
  const day = entry.dayName ?? "Workout";
  return `${entry.routineName}: ${day}`;
}

/** "{name}" — SCHEDULED/MISSED label (routine · day when both exist). */
function entryLabel(entry: ScheduleEntryDTO): string {
  return `${entry.routineName}${entry.dayName ? ` · ${entry.dayName}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

/** COMPLETE / unlinked-workout row: "✓ Completed · {duration}" → the log. */
function CompleteRow({
  label,
  workout,
  target,
}: {
  label: string;
  workout: WorkoutSummaryDTO | null;
  target: string;
}) {
  const navigate = useApp((s) => s.navigate);
  const duration = workout?.durationSec ?? null;
  return (
    <div
      data-row
      role="button"
      tabIndex={0}
      aria-label={`Completed: ${label}${duration ? ` — ${formatDurationParts(duration)}` : ""}`}
      {...tourAttrs({ id: "calendarDay.entryRow", label: "Session row", help: "Open this session's log.", order: 10 })}
      className={cn(ROW_BASE, "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
        navigate(target);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(target);
        }
      }}
    >
      <span className={cn("h-4 w-1 flex-none rounded-full", statusBarClass("DONE"))} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
      <span className="flex flex-none items-center gap-1 text-xs leading-none text-primary">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        Completed
        {duration ? ` · ${formatDurationParts(duration)}` : ""}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
    </div>
  );
}

/** SCHEDULED row: tap → day overview; trailing ⋮ → Unschedule (confirm). */
function ScheduledRow({ dayKey, entry }: { dayKey: string; entry: ScheduleEntryDTO }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const label = entryLabel(entry);
  const target = entry.dayId ? `/days/${entry.dayId}` : `/programs/${entry.routineId}`;

  const unschedule = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await scheduleApi.remove(entry.id);
      invalidate.schedule();
      invalidate.dashboard();
      toast.success(`Unscheduled ${label}`, { description: `${formatDayLabel(dayKey)} is free again` });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <div
        data-row
        role="button"
        tabIndex={0}
        aria-label={`Scheduled: ${label}`}
        {...tourAttrs({ id: "calendarDay.entryRow", label: "Session row", help: "Open this session's day overview.", order: 10 })}
        className={cn(ROW_BASE, "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(target);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(target);
          }
        }}
      >
        <span className={cn("h-4 w-1 flex-none rounded-full", statusBarClass("PLANNED"))} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
        <span className="flex-none text-xs leading-none text-muted-foreground">Scheduled</span>
        <ActionList
          label={`Options for scheduled ${label}`}
          align="end"
          trigger={
            <button
              type="button"
              aria-label={`Options for scheduled ${label}`}
              disabled={!online || removing}
              {...tourAttrs({ id: "calendarDay.menu", label: "Session options", help: "Unschedule this session from the day.", order: 30 })}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
          }
          items={[
            {
              id: "unschedule",
              label: "Unschedule",
              danger: true,
              onSelect: () => setConfirmOpen(true),
            },
          ]}
        />
      </div>

      {/* destructive confirm — §5.1 "Unschedule {name} from {date}?" */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unschedule {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {label} will be removed from {formatDayLabel(dayKey)}. Logged workouts stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void unschedule();
              }}
            >
              Unschedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** MISSED row: the whole row opens the catch-up ActionList (§5.1). */
function MissedRow({ dayKey, entry }: { dayKey: string; entry: ScheduleEntryDTO }) {
  const online = useOnline();
  const invalidate = useInvalidate();
  const { create, conflictDialog } = useScheduleCreate();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = entryLabel(entry);
  const today = todayKey();

  const doItToday = () => {
    void create({
      date: today,
      routineId: entry.routineId,
      ...(entry.dayId ? { dayId: entry.dayId } : {}),
      toastLabel: `Scheduled ${label} for today`,
    });
  };

  const reschedule = async (dateKey: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await scheduleApi.reschedule(entry.id, dateKey);
      invalidate.schedule();
      invalidate.dashboard();
      toast.success(`Moved to ${formatDayLabel(dateKey)}`, { description: label });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("A workout is already planned for that date");
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await scheduleApi.dismiss(entry.id);
      invalidate.schedule();
      invalidate.dashboard();
      toast.success("Missed session dismissed", { description: "It no longer counts against your streak" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ActionList
        label={`Catch-up actions for missed ${label}`}
        trigger={
          <div
            data-row
            role="button"
            tabIndex={0}
            aria-label={`Missed: ${label} — tap for catch-up actions`}
            {...tourAttrs({ id: "calendarDay.missedRow", label: "Missed session row", help: "Tap to do it today, reschedule it, or dismiss the miss.", order: 20 })}
            className={cn(ROW_BASE, "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
          >
            <span className={cn("h-4 w-1 flex-none rounded-full", statusBarClass("MISSED"))} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
            <span className="flex-none text-xs leading-none text-destructive">Missed</span>
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" aria-hidden />
          </div>
        }
        items={[
          { id: "today", label: "Do it today", disabled: !online, onSelect: doItToday },
          { id: "reschedule", label: "Reschedule", disabled: !online, onSelect: () => setRescheduleOpen(true) },
          { id: "dismiss", label: "Dismiss", disabled: !online, danger: true, onSelect: () => void dismiss() },
        ]}
      />

      {/* Reschedule — the ONE shared picker (§5.2 chips included) */}
      <DatePickerDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        initialKey={dayKey < today ? today : dayKey}
        title="Reschedule missed workout"
        description={`${label} moves to a new date.`}
        onSelect={(key) => void reschedule(key)}
      />

      {conflictDialog}
    </>
  );
}

/** REST / SKIPPED rows — informational only (§5.1: not tappable). */
function PassiveRow({ label, status }: { label: string; status: "REST" | "SKIPPED" }) {
  return (
    <div
      data-row
      aria-label={status === "REST" ? `Rest day: ${label}` : `Skipped: ${label}`}
      className={cn(ROW_BASE, "cursor-default text-muted-foreground")}
    >
      <span className={cn("h-4 w-1 flex-none rounded-full", statusBarClass(status === "REST" ? "REST" : "SKIPPED"))} aria-hidden />
      {status === "REST" ? <Moon className="ml-1 h-4 w-4 flex-none" aria-hidden /> : null}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="flex-none text-xs leading-none">{status === "REST" ? "—" : "Skipped"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarDayScreen({ date }: { date: string }) {
  const navigate = useApp((s) => s.navigate);
  const valid = DATE_RE.test(date);

  // Own data: entries for this date (with lazy MISSED derivation) + the day's
  // logged workouts (durations + unlinked rows).
  const scheduleQuery = useQuery({
    queryKey: qk.schedule(date, date),
    queryFn: () => scheduleApi.list({ date }),
    enabled: valid,
  });
  const workoutsQuery = useQuery({
    queryKey: qk.workoutList({ from: date, to: date }),
    queryFn: () => workoutsApi.list({ from: date, to: date }),
    enabled: valid,
  });

  const entries = useMemo(() => scheduleQuery.data?.entries ?? [], [scheduleQuery.data]);
  const workouts = useMemo(() => workoutsQuery.data?.workouts ?? [], [workoutsQuery.data]);
  const workoutById = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);

  // logged workouts already listed via an entry's workoutId stay deduped
  const linkedWorkoutIds = useMemo(
    () => new Set(entries.map((e) => e.workoutId).filter(Boolean) as string[]),
    [entries],
  );
  const unlinkedWorkouts = useMemo(
    () => workouts.filter((w) => !linkedWorkoutIds.has(w.id)),
    [workouts, linkedWorkoutIds],
  );

  const loading = scheduleQuery.isLoading || workoutsQuery.isLoading;

  // invalid date in the hash → straight back to the grid
  if (!valid) {
    return (
      <Screen
        topBar={
          <TopBar
            leading={<BackButton fallbackHash="#/calendar" label="Back to Calendar" />}
            title="Calendar day"
            actions={<TopBarHelp />}
          />
        }
      >
        <ScrollBody>
          <div data-row role="alert" className="flex h-14 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm text-destructive">
            That date could not be read.
          </div>
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash={`#/calendar?view=month&date=${date}`} label="Back to Calendar" />}
          title={formatDayHeading(date)}
          actions={<TopBarHelp />}
        />
      }
      bottomBar={
        <BottomBar>
          <Button
            type="button"
            className="h-11 min-w-0 flex-1 gap-1.5 text-sm font-bold"
            aria-label={`Schedule a workout for ${formatDayLabel(date)}`}
            tour={{ id: "calendarDay.schedule", label: "Schedule a workout", help: "Pick a program day, custom workout or on-demand session for this date.", order: 40 }}
            onClick={() => navigate(`/schedule/pick?date=${date}`)}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Schedule a workout
          </Button>
        </BottomBar>
      }
    >
      <ScrollBody>
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : scheduleQuery.error ? (
          <div
            data-row
            role="alert"
            className="flex h-14 items-center gap-2 rounded-lg border border-destructive/40 bg-card px-3 text-sm text-destructive"
          >
            {errorMessage(scheduleQuery.error)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              if (entry.status === "DONE") {
                return (
                  <CompleteRow
                    key={entry.id}
                    label={completeLabel(entry)}
                    workout={entry.workoutId ? workoutById.get(entry.workoutId) ?? null : null}
                    target={entry.workoutId ? `/logs/${entry.workoutId}` : entry.dayId ? `/days/${entry.dayId}` : "#/calendar"}
                  />
                );
              }
              if (entry.status === "PLANNED") {
                return <ScheduledRow key={entry.id} dayKey={date} entry={entry} />;
              }
              if (entry.status === "MISSED") {
                return <MissedRow key={entry.id} dayKey={date} entry={entry} />;
              }
              if ((entry.dayType ?? "WORKOUT") === "REST" || entry.status === "SKIPPED") {
                return (
                  <PassiveRow
                    key={entry.id}
                    label={(entry.dayType ?? "WORKOUT") === "REST" ? "Rest day" : entryLabel(entry)}
                    status={(entry.dayType ?? "WORKOUT") === "REST" ? "REST" : "SKIPPED"}
                  />
                );
              }
              return null;
            })}

            {unlinkedWorkouts.map((w) => (
              <CompleteRow
                key={w.id}
                label={w.sourceLabel ?? w.comment ?? "Workout"}
                workout={w}
                target={`/logs/${w.id}`}
              />
            ))}

            {entries.length === 0 && unlinkedWorkouts.length === 0 ? (
              <div
                data-row
                aria-label="Nothing on this day"
                className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed bg-muted/25 px-3 text-sm text-muted-foreground"
              >
                Nothing on this day.
              </div>
            ) : null}
          </div>
        )}
      </ScrollBody>
    </Screen>
  );
}
