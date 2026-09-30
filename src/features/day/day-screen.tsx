"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DayScreen — #/days/{dayId} (Part 9 §5 Day Overview).
//
//   TopBar (56)  : BackButton (→ history back, fallback #/workout) · day name
//                  (ellipsis) · ⋯ (Rearrange series → §5.1) · TopBarHelp
//   ScrollBody   : muscle chips (32px horizontal scroller, merged muscles)
//                  · meta line "{sets} SETS · {exercises} EXERCISES" (uppercase
//                  muted, post-override counts) + "Today" chip when this is the
//                  followed program's cursor day
//                  · action row 4×48px equal cells (border-t divider):
//                    [♥ Favorite] [Schedule] [History] [Mark off]
//                    (Mark off hidden for SESSION-kind routines)
//                  · "Equipment ({n})" row 40px chevron → inline expandable
//                    32px rows
//                  · GroupCardStack — GroupCard VIEW mode rendering the
//                    override-MERGED day (server: seriesOrder reorders series,
//                    replacements swap exercise data, notes attach; labels by
//                    size). Per exercise: AMRAP cells (tap → Term definition),
//                    rest expand (restNone → "Rest: none"), 💡 tip (authored
//                    else Part 8 generated), 📝 note row, … menu (Rearrange
//                    series · Replace exercise · Exercise info · Notes).
//   BottomBar(56): "Start workout" → programsApi.startDay(routineId, {dayId})
//                  → #/session. REST days: no bar, "Rest day" body state.
//
// Schedule → the repo DatePickerDialog (schedule-shared) + useScheduleCreate
// (409 conflict replace-confirm + toast with Undo). Mark off → destructive
// confirm AlertDialog → dayApi.markOff → invalidate logs/dashboard/schedule +
// toast with 5s Undo (dayApi.unmarkOff removes the marker + the duration-0 Log).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { BackButton } from "@/components/layout/back-button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownUp,
  CalendarPlus,
  CheckSquare,
  ChevronDown,
  Clock,
  Dumbbell,
  Heart,
  Info,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Moon,
  Play,
  Replace,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tourAttrs } from "@/lib/tour/attrs";
import { useApp } from "@/lib/client/store";
import { dayApi, programsApi } from "@/lib/client/api";
import { qk, useInvalidate, useOnline } from "@/lib/client/query";
import { formatDayLabel, todayKey } from "@/lib/client/format";
import { GroupCard, GroupCardStack, toCardSet, type GroupMenuItem } from "@/components/group-card";
import type { CardAction, CardVisibleColumns } from "@/components/group-card";
import { MUSCLE_LABELS, EQUIPMENT_LABELS, muscleColour, type Equipment, type Muscle } from "@/lib/constants";
import { DatePickerDialog, useScheduleCreate } from "@/features/schedule/schedule-shared";
import { toCardExercise, errorMessage } from "@/features/routines/screen-helpers";
import type { DayDetailDTO, DayExerciseDTO } from "@/lib/types";

const muscleLabel = (m: string) => MUSCLE_LABELS[m as Muscle] ?? m.replace(/_/g, " ").toLowerCase();
const equipmentLabel = (e: string) => EQUIPMENT_LABELS[e as Equipment] ?? e.replace(/_/g, " ").toLowerCase();

/** §5 per-exercise … menu (REPLACES the GroupCard default via menuItems). */
const DAY_MENU: GroupMenuItem[] = [
  { icon: ArrowDownUp, label: "Rearrange series", action: { type: "rearrange-series" } },
  { icon: Replace, label: "Replace exercise", action: { type: "replace" } },
  { icon: Info, label: "Exercise info", action: { type: "detail", exerciseId: "" } },
  { icon: MessageSquareText, label: "Notes", action: { type: "notes" } },
];

const ACTION_CELL_CLS =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-r border-border/40 transition-colors hover:bg-accent/50 last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default function DayScreen({ dayId }: { dayId: string }) {
  return <DayScreenInner key={dayId} dayId={dayId} />;
}

function DayScreenInner({ dayId }: { dayId: string }) {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const qc = useQueryClient();
  const scheduleCreate = useScheduleCreate();

  // ---------- data ----------
  const { data: day, isLoading, error } = useQuery({
    queryKey: qk.day(dayId),
    queryFn: () => dayApi.get(dayId),
    retry: 1,
  });

  // ---------- ui state ----------
  const [favPending, setFavPending] = useState<boolean | null>(null);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [markOffOpen, setMarkOffOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [restExpandedIds, setRestExpandedIds] = useState<Set<string>>(new Set());
  const [startBusy, setStartBusy] = useState(false);

  const isRest = (day?.dayType ?? "WORKOUT") === "REST";
  const isSession = (day?.routine.kind ?? "ROUTINE") === "SESSION";
  const fav = favPending ?? day?.isFavorite ?? false;
  // optimistic favourite resync once the server DTO catches up
  if (favPending != null && day && favPending === day.isFavorite) setFavPending(null);

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  // ---------- mutations ----------
  const invalidateDayFamilies = () => {
    qc.invalidateQueries({ queryKey: ["day"] });
    invalidate.programs();
    invalidate.dashboard();
    invalidate.schedule();
    qc.invalidateQueries({ queryKey: ["workouts"] });
    qc.invalidateQueries({ queryKey: ["workout"] });
  };

  const toggleFavourite = async () => {
    if (!online || !day) {
      if (!online) toast.info("Favourite days need a connection");
      return;
    }
    const next = !fav;
    setFavPending(next);
    try {
      const res = next
        ? await dayApi.favourite(dayId)
        : await dayApi.unfavourite(dayId);
      setFavPending(res.isFavorite);
      invalidateDayFamilies();
      toast.success(res.isFavorite ? `“${day.name}” favourited` : `“${day.name}” unfavourited`);
    } catch (e) {
      setFavPending(null);
      toast.error(errorMessage(e));
    }
  };

  const scheduleDay = (dateKey: string) => {
    if (!day) return;
    void scheduleCreate.create({
      date: dateKey,
      routineId: day.routineId,
      dayId: day.id,
      toastLabel: `Scheduled ${day.routine.name} · ${day.name} for ${formatDayLabel(dateKey)}`,
    });
  };

  const markOff = async () => {
    if (!online || !day) {
      if (!online) toast.info("Marking a day off needs a connection");
      return;
    }
    try {
      const res = await dayApi.markOff(dayId);
      invalidateDayFamilies();
      toast.success(`Day marked off${res.advanced ? " · program advanced" : ""}`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => void unmarkOff(true),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const unmarkOff = async (quiet = false) => {
    if (!online) {
      toast.info("Unmarking needs a connection");
      return;
    }
    try {
      await dayApi.unmarkOff(dayId);
      invalidateDayFamilies();
      if (!quiet) toast.success(`“${day?.name ?? "Day"}” unmarked`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const startWorkout = async () => {
    if (!day || startBusy) return;
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setStartBusy(true);
    try {
      const w = await programsApi.startDay(day.routineId, { dayId: day.id });
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      toast.success(`Started ${day.name}`, {
        description: `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} loaded`,
      });
      navigate("/session");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStartBusy(false);
    }
  };

  // ---------- group cards (view mode, merged day) ----------
  const handleGroupAction =
    (members: DayExerciseDTO[]) =>
    (action: CardAction, entryIndex: number): void => {
      const re = members[entryIndex];
      switch (action.type) {
        case "rearrange-series":
          navigate(`/days/${dayId}/rearrange`);
          break;
        case "replace":
          if (re) navigate(`/days/${dayId}/replace/${re.id}`);
          break;
        case "detail":
          if (re) navigate(`/exercise-overview/${re.exerciseId}`);
          break;
        case "notes":
          if (re) navigate(`/days/${dayId}/notes/${re.id}`);
          break;
        default:
          break; // view mode emits only the §5 … navigations
      }
    };

  const toggleRestExpanded = (key: string) => {
    setRestExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** PredefinedSet → CardSet with §5 isAmrap normalized onto setType. */
  const cardSetsOf = (re: DayExerciseDTO) =>
    re.sets.map((s, j) =>
      toCardSet(
        s.setType == null && s.isAmrap ? { ...s, setType: "AMRAP" } : s,
        j + 1,
      ),
    );

  const renderSeries = (detail: DayDetailDTO) => (
    <div className="flex-none p-2">
      <GroupCardStack>
        {detail.series.map((s) => {
          const restKey = s.key;
          return (
            <GroupCard
              key={s.key}
              mode="view"
              group={{ code: s.code, label: s.label }}
              menuItems={DAY_MENU}
              entries={s.exercises.map((re, i) => ({
                exercise: toCardExercise(re, settings),
                sets: cardSetsOf(re),
                code: s.size > 1 ? `${s.code}${i + 1}` : s.code,
                // 💡 authored tip beats the Part 8 generated trainerTip
                tip: re.tip?.trim() || re.exercise.trainerTip?.trim() || null,
                note: re.note?.trim() || null,
                restNone: re.restNone ?? false,
              }))}
              visibleColumns={visibleColumns}
              restExpanded={restExpandedIds.has(restKey)}
              onToggleRest={() => toggleRestExpanded(restKey)}
              onAction={handleGroupAction(s.exercises)}
            />
          );
        })}
      </GroupCardStack>
    </div>
  );

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          leading={<BackButton fallbackHash="#/workout" label="Back" />}
          title={day ? day.name : "Day overview"}
          actions={
            <>
              {day && !isRest ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 flex-none"
                      aria-label="More actions"
                      tour={{ id: "day.menu", label: "Day menu", help: "Rearrange this day's exercise series.", order: 10 }}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate(`/days/${dayId}/rearrange`)}>
                      <ArrowDownUp className="h-4 w-4" aria-hidden /> Rearrange series
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <TopBarHelp />
            </>
          }
        />
      }
      bottomBar={
        day && !isRest ? (
          <BottomBar>
            <Button
              type="button"
              className="h-11 w-full gap-1.5 whitespace-nowrap text-sm font-bold"
              disabled={startBusy}
              aria-label={`Start ${day.name} workout`}
              tour={{ id: "day.startWorkout", label: "Start workout", help: "Create today's session from this day and start logging.", order: 80 }}
              onClick={() => void startWorkout()}
            >
              {startBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Start workout
            </Button>
          </BottomBar>
        ) : undefined
      }
    >
      <ScrollBody>
        {error || (!isLoading && !day) ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border">
            <p className="text-sm font-semibold">Day not found</p>
            <Button
              type="button"
              variant="outline"
              tour={{ skipTour: true, reason: "Error-state back link for a missing day" }}
              onClick={() => navigate("/workout")}
            >
              Back to workout
            </Button>
          </div>
        ) : isLoading || !day ? (
          <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Loading day">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : isRest ? (
          <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
            <Moon className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Rest day</p>
            <p className="max-w-[280px] text-xs text-muted-foreground">
              {day.routine.name} pauses here — nothing to log. Schedule it or check back tomorrow.
            </p>
          </div>
        ) : (
          <>
            {/* muscle chips (32px) — merged primary muscles */}
            <div
              data-row
              data-chip-scroller
              role="group"
              aria-label="Primary muscles"
              className="no-scrollbar flex h-10 w-full flex-none items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
            >
              <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">Muscles</span>
              {day.primaryMuscles.length > 0 ? (
                day.primaryMuscles.map((m) => (
                  <span
                    key={m}
                    {...tourAttrs({ skipTour: true, reason: "Data-driven muscle chips derived from the day" })}
                    className="flex h-8 flex-none items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold"
                  >
                    <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: muscleColour(m) }} aria-hidden />
                    {muscleLabel(m)}
                  </span>
                ))
              ) : (
                <span className="flex h-8 flex-none items-center rounded-full border bg-card px-3 text-xs font-semibold text-muted-foreground">
                  Mixed
                </span>
              )}
            </div>

            {/* meta line: sets · exercises (post-override) + Today chip */}
            <div data-row className="flex h-10 w-full flex-none items-center gap-2 overflow-hidden whitespace-nowrap">
              <p
                {...tourAttrs({ id: "day.metaLine", label: "Day totals", help: "Planned sets and exercises after your edits.", order: 20 })}
                className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                {day.setsCount} {day.setsCount === 1 ? "set" : "sets"} · {day.exercisesCount} {day.exercisesCount === 1 ? "exercise" : "exercises"}
                {day.phase ? ` · Phase ${day.phase.idx + 1}` : ""}
                {day.estMinutes != null ? ` · ~${day.estMinutes} min` : ""}
              </p>
              {day.isCurrentProgramDay ? (
                <span
                  {...tourAttrs({ id: "day.todayChip", label: "Today chip", help: "This is the current day in your followed program.", order: 30 })}
                  className="flex h-6 flex-none items-center rounded-full border border-primary/50 bg-primary/5 px-2 text-[10px] font-bold uppercase leading-none text-primary"
                >
                  Today
                </span>
              ) : null}
            </div>

            {/* §5 action row — 4×48px equal cells (Mark off hidden for sessions) */}
            <div
              data-row
              role="toolbar"
              aria-label={`Actions for ${day.name}`}
              className="flex h-12 w-full flex-none overflow-hidden whitespace-nowrap rounded-lg border bg-card"
            >
              <Button
                type="button"
                variant="ghost"
                className={cn(ACTION_CELL_CLS, fav && "text-amber-500 hover:text-amber-500")}
                aria-pressed={fav}
                aria-label={fav ? `Unfavourite ${day.name}` : `Favourite ${day.name}`}
                tour={{ id: "day.favorite", label: "Favourite", help: "Star this day to find it faster.", order: 40 }}
                onClick={() => void toggleFavourite()}
              >
                <Heart className="h-4 w-4 flex-none" aria-hidden fill={fav ? "currentColor" : "none"} />
                <span className="text-[12px] font-semibold leading-none">{fav ? "Favourited" : "Favourite"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={ACTION_CELL_CLS}
                aria-label={`Schedule ${day.name}`}
                tour={{ id: "day.schedule", label: "Schedule", help: "Pick a date to plan this day on your calendar.", order: 50 }}
                onClick={() => setScheduleOpen(true)}
              >
                <CalendarPlus className="h-4 w-4 flex-none" aria-hidden />
                <span className="text-[12px] font-semibold leading-none">Schedule</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={ACTION_CELL_CLS}
                aria-label={`History for ${day.name}`}
                tour={{ id: "day.history", label: "History", help: "See every logged workout of this day.", order: 60 }}
                onClick={() => navigate(`/logs?dayId=${dayId}`)}
              >
                <Clock className="h-4 w-4 flex-none" aria-hidden />
                <span className="text-[12px] font-semibold leading-none">History</span>
              </Button>
              {!isSession ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={ACTION_CELL_CLS}
                  aria-label={`Mark ${day.name} off`}
                  tour={{ id: "day.markOff", label: "Mark off", help: "Complete this day without training; the cursor advances.", order: 70 }}
                  onClick={() => setMarkOffOpen(true)}
                >
                  <CheckSquare className="h-4 w-4 flex-none" aria-hidden />
                  <span className="text-[12px] font-semibold leading-none">Mark off</span>
                </Button>
              ) : null}
            </div>

            {/* Equipment ({n}) row — 40px, chevron → inline 32px rows */}
            {day.equipment.length > 0 ? (
              <div className="flex-none overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  data-row
                  aria-expanded={equipmentOpen}
                  {...tourAttrs({ id: "day.equipmentRow", label: "Equipment", help: "The gear this day needs; tap to list it.", order: 80 })}
                  onClick={() => setEquipmentOpen((v) => !v)}
                  className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3 text-left transition-colors hover:bg-accent/40"
                >
                  <Wrench className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">
                    Equipment ({day.equipment.length})
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !equipmentOpen && "-rotate-90")}
                    aria-hidden
                  />
                </button>
                {equipmentOpen ? (
                  <div className="border-t border-border/50">
                    {day.equipment.map((e) => (
                      <div
                        key={e}
                        data-row
                        {...tourAttrs({ skipTour: true, reason: "Data-driven equipment rows inside the inline list" })}
                        className="flex h-8 w-full items-center overflow-hidden whitespace-nowrap border-b border-border/30 px-3 text-sm text-muted-foreground last:border-b-0"
                      >
                        <Dumbbell className="mr-2 h-3.5 w-3.5 flex-none text-muted-foreground/60" aria-hidden />
                        <span className="truncate">{equipmentLabel(e)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* body — GroupCards (view mode) */}
            {day.series.length > 0 ? (
              renderSeries(day)
            ) : (
              <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
                <p className="text-sm font-semibold">No exercises in this day</p>
                <p className="max-w-[280px] text-xs text-muted-foreground">
                  Add exercises from the Builder, then rearrange and replace them here.
                </p>
              </div>
            )}
          </>
        )}

        {/* Schedule → the repo date picker modal (the one allowed non-destructive modal) */}
        <DatePickerDialog
          open={scheduleOpen && day != null}
          onOpenChange={(o) => !o && setScheduleOpen(false)}
          initialKey={todayKey()}
          title={`Schedule ${day?.name ?? "day"}`}
          description={`Which date should ${day?.routine.name ?? "this program"} · ${day?.name ?? "this day"} land on?`}
          onSelect={(dateKey) => {
            setScheduleOpen(false);
            scheduleDay(dateKey);
          }}
        />
        {scheduleCreate.conflictDialog}
      </ScrollBody>

      {/* Mark off — destructive confirm (§5): duration-0 log + cursor advance */}
      <AlertDialog open={markOffOpen} onOpenChange={(o) => !o && setMarkOffOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this day off?</AlertDialogTitle>
            <AlertDialogDescription>
              A workout with duration 0 is logged and the day is marked complete
              {day?.isCurrentProgramDay ? ", and your program cursor advances to the next day" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setMarkOffOpen(false);
                void markOff();
              }}
            >
              Mark off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
