"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SelectedDayPanel — the inline "ActionList" for the selected calendar day
// (Part 9 §6 evolution of the p3-6 panel).
//
//   48px data-row date header : "Thu 25 Sep · 4 sets · 5,400 kg" (aggregate of
//                               the day's workouts; volume falls back to
//                               distance for cardio days)
//   entry rows (56px)         : "{routineName} · {dayName}" + status chip —
//                               DONE (+workoutId) → #/logs/{workoutId}
//                               PLANNED/MISSED/SKIPPED (+dayId) → #/days/{dayId}
//                               REST → muted row, no action (§6)
//                               PLANNED keeps the Part 5 ⋮ (Start now · Move… ·
//                               Skip · Remove) + Reopen for past statuses.
//   unlinked workouts         : logged workouts with no schedule entry also
//                               list (name from sourceLabel) → #/logs/{id}
//   empty (date ≥ today)      : "Nothing scheduled" + [Schedule → #/schedule/pick]
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CalendarClock, Check, Moon, MoreVertical, Play, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsApi } from "@/lib/client/api";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { formatDayLabel, round2, todayKey } from "@/lib/client/format";
import { DatePickerDialog, useScheduleMutations } from "@/features/schedule/schedule-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import { tourAttrs } from "@/lib/tour/attrs";
import type { ScheduleEntryDTO, WorkoutSummaryDTO } from "@/lib/types";

type Props = {
  dayKey: string;
  /** Every schedule entry of the day (multi-entry days list all rows). */
  entries: ScheduleEntryDTO[];
  /** The day's logged workouts (unlinked ones list as extra rows). */
  workouts: WorkoutSummaryDTO[];
};

/** Status chips aligned with the §6 dot colours (accent/outline/danger). */
const STATUS_CHIP: Record<string, string> = {
  PLANNED: "border-primary/60 bg-transparent text-primary",
  DONE: "border-primary/40 bg-primary/10 text-primary",
  MISSED: "border-destructive/40 bg-destructive/10 text-destructive",
  SKIPPED: "border-border bg-muted/40 text-muted-foreground",
};

const chipLabel = (status: string) =>
  status === "MISSED" ? "Missed" : status === "SKIPPED" ? "Skipped" : status === "DONE" ? "Done" : "Planned";

const ROW_BASE =
  "flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2 transition-colors";

/** "Thu 25 Sep · 4 sets · 5,400 kg" — volume, or distance for cardio days. */
function headerStatsText(dayKey: string, workouts: WorkoutSummaryDTO[]): string {
  const label = formatDayLabel(dayKey);
  if (workouts.length === 0) return label;
  const sets = workouts.reduce((n, w) => n + w.setCount, 0);
  const volume = workouts.reduce((n, w) => n + w.volume, 0);
  const distance = workouts.reduce((n, w) => n + w.distance, 0);
  const parts = [label, `${sets} ${sets === 1 ? "set" : "sets"}`];
  if (volume > 0) parts.push(`${Math.round(volume).toLocaleString()} kg`);
  else if (distance > 0) parts.push(`${round2(distance)} km`);
  return parts.join(" · ");
}

function EntryRow({ dayKey, entry }: { dayKey: string; entry: ScheduleEntryDTO }) {
  const navigate = useApp((s) => s.navigate);
  const online = useOnline();
  const invalidate = useInvalidate();
  const { skipEntry, reopenEntry, moveEntry, removeEntry } = useScheduleMutations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const isToday = dayKey === todayKey();
  const planned = entry.status === "PLANNED";
  const rest = (entry.dayType ?? "WORKOUT") === "REST";
  const label = `${entry.routineName}${entry.dayName ? ` · ${entry.dayName}` : ""}`;

  const startNow = async () => {
    if (!entry || !online) {
      if (!online) toast.info("Starting needs a connection");
      return;
    }
    setStarting(true);
    try {
      await programsApi.startDay(entry.routineId, {
        ...(entry.dayId ? { dayId: entry.dayId } : {}),
        date: dayKey,
      });
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${entry.routineName}`);
      navigate(isToday ? "/session" : `/session?date=${dayKey}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  // §6: REST → muted row, no action.
  if (rest) {
    return (
      <div
        data-row
        aria-label={`Rest day: ${label}`}
        className={cn(ROW_BASE, "cursor-default text-muted-foreground")}
      >
        <Moon className="ml-1 h-4 w-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <span
          className={cn(
            "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
            STATUS_CHIP.SKIPPED,
          )}
        >
          Rest
        </span>
      </div>
    );
  }

  const openTarget =
    entry.status === "DONE" && entry.workoutId
      ? `/logs/${entry.workoutId}`
      : entry.dayId
        ? `/days/${entry.dayId}`
        : null;

  return (
    <>
      <div
        data-row
        role={openTarget ? "button" : undefined}
        tabIndex={openTarget ? 0 : undefined}
        aria-label={`Scheduled: ${label} — ${entry.status.toLowerCase()}`}
        {...tourAttrs({ id: "calendar.entryRow", label: "Session row", help: "Open this session's log or day overview.", order: 80 })}
        className={cn(
          ROW_BASE,
          openTarget && "cursor-pointer hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
        onClick={(e) => {
          if (!openTarget) return;
          if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
          navigate(openTarget);
        }}
        onKeyDown={(e) => {
          if (!openTarget || e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(openTarget);
          }
        }}
      >
        <span
          className={cn(
            "h-4 w-1 flex-none rounded-full",
            entry.status === "DONE"
              ? "bg-primary"
              : entry.status === "MISSED"
                ? "bg-destructive/70"
                : entry.status === "PLANNED"
                  ? "bg-primary/40"
                  : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
        {entry.status === "DONE" && entry.markedOff ? (
          <span className="flex flex-none items-center gap-0.5 text-[10px] font-semibold leading-none text-muted-foreground">
            <Check className="h-3 w-3 text-primary" strokeWidth={3} aria-hidden />
            Marked off
          </span>
        ) : null}
        <span
          className={cn(
            "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
            STATUS_CHIP[entry.status] ?? STATUS_CHIP.SKIPPED,
          )}
        >
          {chipLabel(entry.status)}
        </span>

        {planned ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 flex-none p-0"
                aria-label={`Actions for scheduled ${label}`}
                tour={{ id: "calendar.dayMenu", label: "Day menu", help: "Start, move, skip or remove the scheduled session.", order: 100 }}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isToday ? (
                <DropdownMenuItem disabled={starting} onClick={() => void startNow()}>
                  <Play className="h-4 w-4" aria-hidden /> Start now
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Move…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void skipEntry(entry)}>
                <SkipForward className="h-4 w-4" aria-hidden /> Skip
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : dayKey >= todayKey() ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-none gap-1 px-3 text-xs font-bold"
            aria-label={`Reopen ${label}`}
            tour={{ id: "calendar.reopen", label: "Reopen", help: "Put a done, missed or skipped session back on the plan.", order: 110 }}
            onClick={() => void reopenEntry(entry)}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reopen
          </Button>
        ) : null}
      </div>

      <DatePickerDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        initialKey={dayKey}
        title="Move scheduled workout"
        description={`${label} moves to a new date.`}
        onSelect={(key) => void moveEntry(entry, key)}
      />

      {/* confirm-destructive: remove schedule entry */}
      <AlertDialog open={removeOpen} onOpenChange={(o) => !o && setRemoveOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove scheduled workout?</AlertDialogTitle>
            <AlertDialogDescription>
              {label} on {formatDayLabel(dayKey)} will be removed from your plan. Logged workouts stay
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setRemoveOpen(false);
                void removeEntry(entry.id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A logged workout with no schedule entry (ad-hoc session). */
function WorkoutRow({ workout }: { workout: WorkoutSummaryDTO }) {
  const navigate = useApp((s) => s.navigate);
  const name = workout.sourceLabel ?? workout.comment ?? "Workout";
  return (
    <div
      data-row
      role="button"
      tabIndex={0}
      aria-label={`Logged: ${name}`}
      {...tourAttrs({ id: "calendar.workoutRow", label: "Workout row", help: "Open this logged workout's detail.", order: 120 })}
      className={cn(ROW_BASE, "cursor-pointer hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a, [role=menuitem]")) return;
        navigate(`/logs/${workout.id}`);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/logs/${workout.id}`);
        }
      }}
    >
      <span className="h-4 w-1 flex-none rounded-full bg-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{name}</span>
      <span
        className={cn(
          "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
          STATUS_CHIP.DONE,
        )}
      >
        Done
      </span>
    </div>
  );
}

export function SelectedDayPanel({ dayKey, entries, workouts }: Props) {
  const navigate = useApp((s) => s.navigate);

  // workouts already referenced by an entry's workoutId don't need their own row
  const linkedWorkoutIds = new Set(entries.map((e) => e.workoutId).filter(Boolean));
  const unlinkedWorkouts = workouts.filter((w) => !linkedWorkoutIds.has(w.id));

  return (
    <section className="flex flex-col gap-2 pt-1" aria-label={`Selected day ${dayKey}`}>
      {/* 48px computed date header */}
      <h3
        data-row
        className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-sm font-semibold"
      >
        <span className="flex-none">{headerStatsText(dayKey, workouts)}</span>
      </h3>

      {dayKey >= todayKey() && entries.length === 0 ? (
        <div
          data-row
          aria-label="Schedule"
          className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2"
        >
          <CalendarClock className="ml-1 h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Nothing scheduled</span>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-none gap-1.5 px-3 text-xs font-bold"
            aria-label={`Schedule a workout for ${formatDayLabel(dayKey)}`}
            tour={{ id: "calendar.schedule", label: "Schedule", help: "Pick a routine session for the selected day.", order: 90 }}
            onClick={() => navigate(`/schedule/pick?date=${dayKey}`)}
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            Schedule
          </Button>
        </div>
      ) : null}

      {entries.map((entry) => (
        <EntryRow key={entry.id} dayKey={dayKey} entry={entry} />
      ))}

      {unlinkedWorkouts.map((workout) => (
        <WorkoutRow key={workout.id} workout={workout} />
      ))}
    </section>
  );
}
