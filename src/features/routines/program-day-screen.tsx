"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProgramDayScreen — #/programs/{id}/day/{dayId} (Part 6 §4.6 day detail).
//
//   TopBar (56)  : [◀ back to the program] · day name · favourite star 44px ·
//                  ⋮ (Open in program · Schedule…)
//   ScrollBody   : DayHeaderBlock 96 (DurationRing 56 "~45m" · muscle chips ·
//                  `6 exercises · 18 sets`) → DayActionRow 48 (shared §4.5
//                  component) → ExerciseCard×N mode="template" (groupCode
//                  chips; set edits persist immediately — the same renderer
//                  the program detail day body uses) → dashed
//                  "Add exercise to day" 40px row.
//   BottomBar(56): `Log today` (routinesApi.logDay → #/today) or `Continue`
//                  when today's workout is sourced from this day.
//
// No SubBar, no sheets — inline everything. Metadata (primaryMuscles,
// estMinutes) degrades silently while agent 6-c0's seeds land.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  MoreVertical,
  Play,
  Plus,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { programsMetaApi, routinesApi, scheduleApi } from "@/lib/client/api";
import {
  qk,
  useDashboard,
  useInvalidate,
  useOnline,
  useWorkoutByDate,
} from "@/lib/client/query";
import { todayKey, addDaysKey } from "@/lib/client/format";
import { computeGroupCodes } from "@/lib/group-codes";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import type { CardAction, CardSet, CardVisibleColumns } from "@/components/exercise-card/exercise-card";
import { ExerciseCard } from "@/components/exercise-card/exercise-card";
import type { RoutineDayDTO, RoutineExerciseDTO } from "@/lib/types";
import {
  DragGlyph,
  cardPatchToPredefinedInput,
  cardSetsOf,
  errorMessage,
  toCardExercise,
  useLastSetsPrefill,
  useRoutineRun,
} from "./screen-helpers";
import { DayActionRow } from "./day-action-row";
import { DayHeaderBlock } from "./header-block";
import { programExtraKeys, useProgramExtras } from "./program-meta";

// ---------- exercise notes popover (same pattern as the program detail body) ----------

function ExerciseNotesPopover({
  exerciseName,
  notes,
  open,
  onClose,
}: {
  exerciseName: string;
  notes: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span className="absolute bottom-2 left-2 h-1 w-1" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {exerciseName} — notes
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {notes && notes.trim().length > 0 ? notes : "No notes on this exercise."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ---------- screen ----------

export default function ProgramDayScreen({ routineId, dayId }: { routineId: string; dayId: string }) {
  return <ProgramDayInner key={`${routineId}:${dayId}`} routineId={routineId} dayId={dayId} />;
}

function ProgramDayInner({ routineId, dayId }: { routineId: string; dayId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const online = useOnline();
  const invalidate = useInvalidate();
  const invalidateExtras = useProgramExtras();
  const { run } = useRoutineRun();
  const prefillFor = useLastSetsPrefill();
  const scheduleCreate = useScheduleCreate();

  // ---------- data ----------
  const { data: routine, isLoading, error } = useQuery({
    queryKey: qk.routine(routineId),
    queryFn: () => routinesApi.get(routineId),
    retry: 1,
  });
  const days = useMemo(
    () => (routine ? [...routine.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [routine],
  );
  const day = useMemo(() => days.find((d) => d.id === dayId) ?? null, [days, dayId]);
  const exercises = useMemo(
    () => (day ? [...day.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [day],
  );
  const { codes: groupCodes } = useMemo(() => computeGroupCodes(exercises), [exercises]);
  const setCount = exercises.reduce((n, re) => n + re.sets.length, 0);

  // completion state (Done chip + Mark off resync) — same union as §4.5
  const { data: dashboardData } = useDashboard();
  const followed =
    dashboardData?.active && dashboardData.active.routineId === routineId
      ? dashboardData.active
      : null;
  const scheduleEntriesQuery = useQuery({
    queryKey: programExtraKeys.schedule(routineId),
    queryFn: () =>
      scheduleApi.list({ from: addDaysKey(todayKey(), -400), to: addDaysKey(todayKey(), 60) }),
  });
  const [completedDelta, setCompletedDelta] = useState<Map<string, boolean>>(new Map());
  const serverCompletedIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of followed?.completedDayIds ?? []) s.add(id);
    for (const e of scheduleEntriesQuery.data?.entries ?? []) {
      if (e.routineId === routineId && e.status === "DONE" && e.dayId) s.add(e.dayId);
    }
    return s;
  }, [followed, scheduleEntriesQuery.data, routineId]);
  const completedIds = useMemo(() => {
    const s = new Set(serverCompletedIds);
    for (const [id, on] of completedDelta) {
      if (on) s.add(id);
      else s.delete(id);
    }
    return s;
  }, [serverCompletedIds, completedDelta]);
  const applyCompletedDelta = (id: string, completed: boolean) => {
    setCompletedDelta((prev) => {
      const next = new Map(prev);
      next.set(id, completed);
      return next;
    });
  };

  // today's workout — Continue when it is sourced from this day
  const todayK = todayKey();
  const todayWorkoutQuery = useWorkoutByDate(todayK);
  const todayWorkout = todayWorkoutQuery.data?.workout ?? null;
  const continueMode = todayWorkout?.sourceDayId === dayId;

  // ---------- ui state ----------
  const [collapsedReIds, setCollapsedReIds] = useState<Set<string>>(new Set());
  const [notesReId, setNotesReId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [favPending, setFavPending] = useState<boolean | null>(null);
  const dayIsFav = favPending ?? (day?.isFavorite ?? false);
  if (favPending != null && day && favPending === (day.isFavorite ?? false)) setFavPending(null);

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  // ---------- mutations ----------
  const toggleDayFavourite = async () => {
    if (!day || !online) {
      toast.info("Favourite days need a connection");
      return;
    }
    const next = !dayIsFav;
    setFavPending(next);
    try {
      const res = await programsMetaApi.favouriteDay(routineId, day.id);
      setFavPending(res.isFavorite);
      invalidateExtras(routineId);
      toast.success(res.isFavorite ? "Day favourited" : "Day unfavourited");
    } catch (e) {
      setFavPending(null);
      toast.error(errorMessage(e));
    }
  };

  const doLogToday = async () => {
    if (!routine || !day || logging) return;
    if (!online) {
      toast.info("Logging a day needs a connection");
      return;
    }
    setLogging(true);
    try {
      await routinesApi.logDay(routineId, { dayId: day.id, date: todayK });
      invalidate.workout(todayK);
      invalidate.programs();
      invalidate.dashboard();
      invalidateExtras(routineId);
      toast.success(`Logged ${day.name} to today`);
      navigate("/today");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLogging(false);
    }
  };

  const scheduleThisDay = (dateKey: string) => {
    if (!routine || !day) return;
    void scheduleCreate.create({
      date: dateKey,
      routineId,
      dayId: day.id,
      toastLabel: `Scheduled ${routine.name} · ${day.name}`,
    });
  };

  // ---------- template card mutations (same flows as the program detail body) ----------
  const reorderExercises = async (ids: string[], reId: string, delta: -1 | 1) => {
    if (!day) return;
    const i = ids.indexOf(reId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    await run(() => routinesApi.reorderExercises(routineId, day.id, next), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/order`,
      method: "PUT",
      body: { ids: next },
      label: "Exercise order",
    });
  };

  const patchPredefinedSet = async (re: RoutineExerciseDTO, setId: string, patch: Partial<CardSet>) => {
    if (!day) return;
    const input = cardPatchToPredefinedInput(patch);
    if (Object.keys(input).length === 0) return;
    await run(() => routinesApi.updateSet(routineId, day.id, re.id, setId, input), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "PATCH",
      body: input,
      label: "Set updated",
    });
  };

  const removePredefinedSet = async (re: RoutineExerciseDTO, setId: string) => {
    if (!day) return;
    await run(() => routinesApi.removeSet(routineId, day.id, re.id, setId), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
      method: "DELETE",
      label: "Set removed",
    });
  };

  const addPredefinedSet = async (re: RoutineExerciseDTO) => {
    if (!day) return;
    await run(() => routinesApi.addSet(routineId, day.id, re.id, {}), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets`,
      method: "POST",
      body: {},
      label: "Set added",
    });
  };

  const copyLastToSet = async (re: RoutineExerciseDTO, setId: string) => {
    if (!day) return;
    const sorted = [...re.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = await prefillFor(re.exerciseId, idx);
    if (!src) {
      toast.info("No previous workout to copy from");
      return;
    }
    await run(
      () =>
        routinesApi.updateSet(routineId, day.id, re.id, setId, {
          weight: src.weight,
          reps: src.reps,
          distance: src.distance,
          timeSec: src.timeSec,
        }),
      {
        path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}/sets/${setId}`,
        method: "PATCH",
        body: { weight: src.weight, reps: src.reps, distance: src.distance, timeSec: src.timeSec },
        label: "Copied from last workout",
      },
    );
    toast.success("Copied from last workout");
  };

  const removeRoutineExercise = async (re: RoutineExerciseDTO) => {
    if (!day) return;
    await run(() => routinesApi.removeExercise(routineId, day.id, re.id), {
      path: `/api/routines/${routineId}/days/${day.id}/exercises/${re.id}`,
      method: "DELETE",
      label: `Removed ${re.exercise.name}`,
    });
    toast.success(`${re.exercise.name} removed from day`);
  };

  const handleCardAction = (re: RoutineExerciseDTO) => (action: CardAction): void => {
    switch (action.type) {
      case "toggle-collapse":
        setCollapsedReIds((prev) => {
          const next = new Set(prev);
          if (next.has(re.id)) next.delete(re.id);
          else next.add(re.id);
          return next;
        });
        break;
      case "add-set":
        void addPredefinedSet(re);
        break;
      case "update-set":
        void patchPredefinedSet(re, action.setId, action.patch);
        break;
      case "remove-set":
        void removePredefinedSet(re, action.setId);
        break;
      case "copy-last":
        void copyLastToSet(re, action.setId);
        break;
      case "move-up":
      case "move-down": {
        const ids = exercises.map((e) => e.id);
        void reorderExercises(ids, re.id, action.type === "move-up" ? -1 : 1);
        break;
      }
      case "remove":
        void removeRoutineExercise(re);
        break;
      case "notes":
        setNotesReId(re.id);
        break;
      case "add-to-group":
        toast.info("Routine groups arrive with a later build");
        break;
      case "replace":
        toast.info("Replacing exercises in templates arrives with a later build");
        break;
      case "select":
        toast.info("Multi-select arrives with the next build");
        break;
      case "rest-timer":
        toast.info("The rest timer lives on the Today screen");
        break;
      case "toggle-done":
      case "toggle-select":
      case "open":
        break;
    }
  };

  const dayMinutes = day?.estMinutes ?? routine?.estMinutes ?? null;

  // ---------- render ----------
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
              onClick={() => navigate(`/programs/${routineId}`)}
              aria-label={`Back to ${routine?.name ?? "program"}`}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={day ? day.name : "Day"}
          actions={
            day ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-11 w-11 flex-none", dayIsFav && "text-amber-500 hover:text-amber-500")}
                  aria-pressed={dayIsFav}
                  aria-label={dayIsFav ? `Unfavourite ${day.name}` : `Favourite ${day.name}`}
                  onClick={() => void toggleDayFavourite()}
                >
                  <Star className="h-5 w-5" aria-hidden fill={dayIsFav ? "currentColor" : "none"} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate(`/programs/${routineId}`)}>
                      <ExternalLink className="h-4 w-4" aria-hidden /> Open in program
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                      <CalendarClock className="h-4 w-4" aria-hidden /> Schedule…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : undefined
          }
        />
      }
      bottomBar={
        day && (day.dayType ?? "WORKOUT") === "WORKOUT" ? (
          <BottomBar>
            {continueMode ? (
              <Button
                type="button"
                className="h-11 w-full gap-2 text-base font-bold"
                aria-label="Continue today's workout"
                onClick={() => navigate("/today")}
              >
                <Play className="h-5 w-5" aria-hidden />
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 w-full gap-2 text-base font-bold"
                disabled={logging}
                aria-label={`Log ${day.name} to today`}
                onClick={() => void doLogToday()}
              >
                <Zap className="h-5 w-5" aria-hidden />
                {logging ? "Logging…" : "Log today"}
              </Button>
            )}
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button type="button" variant="outline" onClick={() => navigate(`/programs/${routineId}`)}>
              Back to program
            </Button>
          </div>
        ) : isLoading || !routine || !day ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading day">
            <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (day.dayType ?? "WORKOUT") === "REST" ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Rest day</p>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Nothing to log for a rest day — open the program to see where it sits.
            </p>
            <Button type="button" variant="outline" onClick={() => navigate(`/programs/${routineId}`)}>
              Open in program
            </Button>
          </div>
        ) : (
          <>
            {/* §4.6 day overview: DurationRing + muscle chips + counts */}
            <DayHeaderBlock
              minutes={dayMinutes}
              primaryMuscles={day.primaryMuscles}
              exerciseCount={exercises.length}
              setCount={setCount}
              showMuscleChips={settings?.showMuscleChips ?? true}
            />

            {/* §4.5/§4.6 shared action row */}
            <DayActionRow
              routineId={routineId}
              dayId={day.id}
              dayName={day.name}
              isFavorite={day.isFavorite ?? false}
              isCompleted={completedIds.has(day.id)}
              onSchedule={() => setScheduleOpen(true)}
              onCompletedChange={(completed) => applyCompletedDelta(day.id, completed)}
            />

            {exercises.map((re) => {
              const openNotes = notesReId === re.id;
              return (
                <div key={re.id} className="relative flex-none">
                  <ExerciseCard
                    mode="template"
                    exercise={toCardExercise(re, settings)}
                    sets={cardSetsOf(re)}
                    collapsed={collapsedReIds.has(re.id)}
                    visibleColumns={visibleColumns}
                    groupCode={groupCodes.get(re.id)}
                    onAction={handleCardAction(re)}
                  />
                  {openNotes ? (
                    <ExerciseNotesPopover
                      exerciseName={re.exercise.name}
                      notes={re.exercise.notes ?? null}
                      open
                      onClose={() => setNotesReId(null)}
                    />
                  ) : null}
                </div>
              );
            })}

            {exercises.length === 0 ? (
              <p className="flex-none rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                No exercises in this day yet.
              </p>
            ) : null}

            <button
              type="button"
              data-row
              className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
              onClick={() => navigate(`/exercises?context=routine&routineId=${routineId}&dayId=${day.id}`)}
            >
              <Plus className="h-4 w-4 flex-none" aria-hidden />
              Add exercise to day
            </button>

            <div className="h-2 flex-none" aria-hidden />

            <DatePickerDialog
              open={scheduleOpen}
              onOpenChange={setScheduleOpen}
              title={`Schedule ${day.name}`}
              description={`Which date should ${routine.name} · ${day.name} land on?`}
              onSelect={(dateKey) => {
                setScheduleOpen(false);
                scheduleThisDay(dateKey);
              }}
            />
            {scheduleCreate.conflictDialog}
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}
