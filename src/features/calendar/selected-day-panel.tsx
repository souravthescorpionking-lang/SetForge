"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SelectedDayPanel — the inline replacement for the legacy day-sheet Dialog
// (p3-6: the Dialog is FORBIDDEN; day details expand inline below the grid).
// Part 5: a ScheduleRow renders at the TOP whenever the selected date is
// today or later — "Nothing scheduled" + [Schedule] when empty, the planned
// entry with a ⋮ (Start now · Move… · Skip · Remove confirm) when PLANNED,
// and a status chip + Reopen for DONE/MISSED/SKIPPED.
//
//   48px data-row date header : "Thu 25 Sep · 4 sets · 5,400 kg" (computed —
//                               volume falls back to distance for cardio days)
//   ExerciseCard ×N           : summary mode one-liners; tap → expands inline
//                               to read mode with SetRows; tap again collapses;
//                               only ONE card expanded at a time.
//   empty day                 : one muted 48px data-row "Rest day".
//
// The workout detail comes from the shared byDate query cache (same key the
// legacy day-sheet used), so opening a day the List view already fetched is
// instant.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, MoreVertical, Play, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsApi } from "@/lib/client/api";
import { useInvalidate, useOnline, useWorkoutByDate } from "@/lib/client/query";
import { formatDayLabel, round2, todayKey } from "@/lib/client/format";
import { exerciseUnit } from "@/features/exercises/labels";
import { DatePickerDialog, useScheduleMutations } from "@/features/schedule/schedule-shared";
import { errorMessage } from "@/features/routines/screen-helpers";
import type { ScheduleEntryDTO, SetDTO, WorkoutSummaryDTO, SettingsDTO, WorkoutExerciseDTO } from "@/lib/types";
import { ExerciseNotesPopover } from "@/features/today/card-popovers";

type Props = {
  dayKey: string;
  /** Month-index summary of the day (instant stats while the detail loads). */
  summary?: WorkoutSummaryDTO;
  /** Part 5: the day's schedule entry (when one exists). */
  entry?: ScheduleEntryDTO;
  visibleColumns: CardVisibleColumns;
};

/**
 * SetDTO → CardSet for read/summary rendering. NB: SetDTO.distance is stored
 * in KILOMETRES while CardSet.distanceM renders metres ("800 m" / "5 km") —
 * the mapper converts km→m so cardio days display "5 km", not "5 m".
 */
function toReadCardSets(sets: SetDTO[]): CardSet[] {
  return [...sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) =>
      toCardSet(
        { ...s, distance: s.distance != null ? s.distance * 1000 : null },
        i + 1,
      ),
    );
}

function toCardExercise(we: WorkoutExerciseDTO, settings: SettingsDTO | null): CardExercise {
  return {
    id: we.id,
    name: we.exercise.name,
    categoryLabel: we.exercise.category?.name ?? "Exercise",
    categoryColour: we.exercise.category?.colour ?? "#71717a",
    modality: we.exercise.type,
    unit: exerciseUnit(we.exercise, settings),
    weightIncrement: we.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  };
}

/** "Thu 25 Sep · 4 sets · 5,400 kg" — volume, or distance for cardio days. */
function headerStatsText(
  dayKey: string,
  stats: { sets: number; volume: number; distance: number } | null,
): string {
  if (!stats) return formatDayLabel(dayKey);
  const parts: string[] = [formatDayLabel(dayKey), `${stats.sets} ${stats.sets === 1 ? "set" : "sets"}`];
  if (stats.volume > 0) parts.push(`${Math.round(stats.volume).toLocaleString()} kg`);
  else if (stats.distance > 0) parts.push(`${round2(stats.distance)} km`);
  return parts.join(" · ");
}

// ── Part 5: the schedule row at the top of the panel ─────────────────────────

const STATUS_CHIP: Record<string, string> = {
  PLANNED: "border-primary/50 bg-primary/10 text-primary",
  DONE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MISSED: "border-border bg-muted/40 text-muted-foreground",
  SKIPPED: "border-border bg-muted/40 text-muted-foreground",
};

function ScheduleRow({ dayKey, entry }: { dayKey: string; entry?: ScheduleEntryDTO }) {
  const navigate = useApp((s) => s.navigate);
  const invalidate = useInvalidate();
  const online = useOnline();
  const { skipEntry, reopenEntry, moveEntry, removeEntry } = useScheduleMutations();
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const isToday = dayKey === todayKey();
  const planned = entry?.status === "PLANNED";

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
      navigate(isToday ? "/today" : `/today?date=${dayKey}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  // no entry → "Nothing scheduled" + [Schedule]
  if (!entry) {
    return (
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
    );
  }

  const label = `${entry.routineName}${entry.dayName ? ` · ${entry.dayName}` : ""}`;

  // PLANNED → source bar + Planned chip + ⋮ actions
  if (planned) {
    return (
      <>
        <div
          data-row
          aria-label={`Scheduled: ${label}`}
          className="relative flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card pl-3 pr-1"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{label}</span>
          <span
            className={cn(
              "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
              STATUS_CHIP.PLANNED,
            )}
          >
            Planned
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-11 p-0"
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

  // DONE / MISSED / SKIPPED → status chip + Reopen (date ≥ today)
  return (
    <div
      data-row
      aria-label={`Scheduled: ${label} — ${entry.status.toLowerCase()}`}
      className="flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border bg-card px-2"
    >
      <span
        className={cn(
          "h-4 w-1 flex-none rounded-full",
          entry.status === "DONE" ? "bg-primary" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex h-6 flex-none items-center rounded-full border px-2 text-[10px] font-bold uppercase leading-none",
          STATUS_CHIP[entry.status] ?? STATUS_CHIP.MISSED,
        )}
      >
        {entry.status === "MISSED" ? "Missed" : entry.status === "SKIPPED" ? "Skipped" : "Done"}
      </span>
      {dayKey >= todayKey() ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-none gap-1 px-3 text-xs font-bold"
          aria-label={`Reopen ${label}`}
          tour={{ id: "calendar.reopen", label: "Reopen", help: "Put a done, missed or skipped session back on the plan.", order: 100 }}
          onClick={() => void reopenEntry(entry)}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reopen
        </Button>
      ) : null}
    </div>
  );
}

export function SelectedDayPanel({ dayKey, summary, entry, visibleColumns }: Props) {
  const settings = useApp((s) => s.settings);
  const navigate = useApp((s) => s.navigate);
  const { data, isLoading } = useWorkoutByDate(dayKey);
  const workout = data?.workout ?? null;

  // only ONE card expanded at a time (p3-6 spec)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesWeId, setNotesWeId] = useState<string | null>(null);

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );

  const stats = useMemo(() => {
    if (workout) {
      let volume = 0;
      let sets = 0;
      let distance = 0;
      for (const we of workout.exercises) {
        for (const s of we.sets) {
          sets++;
          volume += (s.weight ?? 0) * (s.reps ?? 0);
          distance += s.distance ?? 0;
        }
      }
      return { sets, volume, distance };
    }
    if (summary) return { sets: summary.setCount, volume: summary.volume, distance: summary.distance };
    return null;
  }, [workout, summary]);

  const handleCardAction =
    (we: WorkoutExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "open":
          // summary-mode header tap → expand inline; the read-mode ⋮ "Open"
          // item → the per-exercise focus screen (day context preserved).
          if (expandedId === we.id) navigate(`/today/${we.id}?date=${dayKey}`);
          else setExpandedId(we.id);
          break;
        case "toggle-collapse":
          setExpandedId((prev) => (prev === we.id ? null : we.id));
          break;
        case "notes":
          setNotesWeId(we.id);
          break;
        default:
          break; // read-only panel — no mutations here
      }
    };

  const notesWe = notesWeId ? exercises.find((we) => we.id === notesWeId) : null;

  return (
    <section className="flex flex-col gap-2" aria-label={`Selected day ${dayKey}`}>
      {/* Part 5: schedule row (today and future days only) */}
      {dayKey >= todayKey() ? <ScheduleRow dayKey={dayKey} entry={entry} /> : null}

      {/* 48px computed date header */}
      <h3
        data-row
        className="flex h-12 items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-sm font-semibold"
      >
        <span className="flex-none">{headerStatsText(dayKey, stats)}</span>
      </h3>

      {isLoading && !data ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading day">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : exercises.length > 0 ? (
        exercises.map((we) => (
          <div key={we.id} className="flex flex-col">
            <ExerciseCard
              mode={expandedId === we.id ? "read" : "summary"}
              exercise={toCardExercise(we, settings)}
              sets={toReadCardSets(we.sets)}
              visibleColumns={visibleColumns}
              onAction={handleCardAction(we)}
            />
            {notesWeId === we.id && notesWe ? (
              <div className="relative flex-none">
                <ExerciseNotesPopover
                  exercise={notesWe.exercise}
                  open
                  onClose={() => setNotesWeId(null)}
                />
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div
          data-row
          className="flex h-12 items-center overflow-hidden whitespace-nowrap rounded-lg border border-dashed px-3 text-sm text-muted-foreground"
        >
          Rest day
        </div>
      )}
    </section>
  );
}
