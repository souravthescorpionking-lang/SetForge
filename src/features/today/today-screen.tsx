"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodayScreen — the Part 3 rebuild of the day view (#/today), composed ONLY
// from the layout primitives (Screen/TopBar/SubBar/ScrollBody/BottomBar/NavBar)
// and the ONE ExerciseCard (edit mode) from @/components/exercise-card.
//
//   TopBar (56)  : brand "SetForge" · Calendar action · ⋮ menu
//   SubBar (48)  : DateStrip ◄ [Thu 25 Sep] ► + Today chip (date via ?date=)
//   ScrollBody   : MetaRow → ExerciseCard×N → SummaryRow → spacer
//                  (or ONE 200px empty-state block on days with no workout)
//   BottomBar(56): "+ Add exercise" — CONTENT swaps to RestBar while a rest
//                  countdown runs (same container, never both, never stacked)
//
// Data/mutation logic is REUSED from the legacy today feature (today-view /
// track-tab / workout-header-card): useWorkoutByDate + use-mutate (offline
// outbox), toggle-timer, add/patch/toggle sets with auto-rest, reorder
// exercises, group membership, start/copy workout. The rest engine is
// extracted into ./rest-state (no rendering — the BottomBar shows it).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar } from "@/components/layout";
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
import { CalendarDays, Dumbbell, History, MoreVertical, Settings, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { ApiError, workoutsApi, type SetInput } from "@/lib/client/api";
import { qk, useInvalidate, useOnline, useWorkoutByDate } from "@/lib/client/query";
import { addDaysKey, todayKey } from "@/lib/client/format";
import { formatDuration } from "@/lib/formulas";
import { useHashRoute } from "@/features/shell/router";
import { defaultUnitFor, exerciseUnit } from "@/features/exercises/labels";
import type { SetDTO, WorkoutExerciseDTO, WorkoutGroupDTO } from "@/lib/types";
import { useMutate } from "./use-mutate";
import { useRestState } from "./rest-state";
import { DateStrip } from "./date-strip";
import { MetaRow } from "./meta-row";
import { SummaryRow } from "./summary-row";
import { TodayEmpty } from "./today-empty";
import { AddExerciseBar, RestBar } from "./rest-bar";
import {
  ConfirmRemoveExercise,
  ExerciseGroupPopover,
  ExerciseNotesPopover,
} from "./card-popovers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Map a CardSet patch (SetRow/ExerciseCard contract) onto the API's SetInput. */
function cardPatchToSetInput(patch: Partial<CardSet>): SetInput {
  const out: SetInput = {};
  if ("weightKg" in patch) out.weight = patch.weightKg ?? null;
  if ("reps" in patch) out.reps = patch.reps ?? null;
  if ("distanceM" in patch) out.distance = patch.distanceM ?? null;
  if ("timeSec" in patch) out.timeSec = patch.timeSec ?? null;
  if ("rpe" in patch) out.rpe = patch.rpe ?? null;
  if ("tempo" in patch) out.tempo = patch.tempo ?? null;
  if ("restPlannedSec" in patch) out.restPlannedSec = patch.restPlannedSec ?? null;
  if ("setType" in patch) out.setType = patch.setType ?? "NORMAL";
  if ("note" in patch) out.comment = patch.note ?? null;
  if ("done" in patch) out.isComplete = !!patch.done;
  return out;
}

export default function TodayScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const online = useOnline();
  const mutate = useMutate();
  const rest = useRestState();

  // ---------- date state (syncs with the ?date= query param) ----------
  const routeDate = route.name === "today" ? route.query.get("date") : null;
  const [dateKey, setDateKey] = useState(() =>
    routeDate && DATE_RE.test(routeDate) ? routeDate : todayKey(),
  );

  useEffect(() => {
    if (routeDate && DATE_RE.test(routeDate)) {
      if (routeDate !== dateKey) setDateKey(routeDate);
    } else if (route.name === "today" && !routeDate && dateKey !== todayKey()) {
      // #/today without a ?date= param always means today.
      setDateKey(todayKey());
    }
  }, [routeDate, route.name, dateKey]);

  const goTo = useCallback(
    (key: string) => {
      setDateKey(key);
      if (key === todayKey()) navigate("/today");
      else navigate(`/today?date=${key}`);
    },
    [navigate],
  );

  // ---------- data ----------
  const { data, isLoading } = useWorkoutByDate(dateKey);
  const workout = data?.workout ?? null;

  // does any workout exist before this date? (enables "Copy Previous")
  const previousWorkouts = useQuery({
    queryKey: qk.workoutList({ to: addDaysKey(dateKey, -1), limit: 1 }),
    queryFn: () => workoutsApi.list({ to: addDaysKey(dateKey, -1) }),
    staleTime: 30_000,
  });
  const hasPrevious = (previousWorkouts.data?.workouts.length ?? 0) > 0;

  // ---------- ui state ----------
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [notesWeId, setNotesWeId] = useState<string | null>(null);
  const [groupWeId, setGroupWeId] = useState<string | null>(null);
  const [removeWeId, setRemoveWeId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );
  const groupById = useMemo(() => {
    const m = new Map<string, WorkoutGroupDTO>();
    for (const g of workout?.groups ?? []) m.set(g.id, g);
    return m;
  }, [workout]);

  const removeWe = workout && removeWeId ? (exercises.find((we) => we.id === removeWeId) ?? null) : null;

  // ---------- empty-day actions (legacy logic) ----------
  const startNewWorkout = async () => {
    if (!online) {
      toast.info("Starting a workout needs a connection");
      return;
    }
    setCreating(true);
    try {
      await workoutsApi.createOrGet(dateKey);
      invalidate.workout(dateKey);
      toast.success("New workout started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start workout");
    } finally {
      setCreating(false);
    }
  };

  const copyPreviousWorkout = async () => {
    if (!online) {
      toast.info("Copying needs a connection");
      return;
    }
    setCreating(true);
    try {
      const w = await workoutsApi.createOrGet(dateKey);
      await workoutsApi.copy(w.id, {});
      invalidate.workout(dateKey);
      toast.success("Previous workout copied in");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        toast.info("No source workout found — log a session first, then copy it forward");
      } else {
        toast.error(e instanceof Error ? e.message : "Copy failed");
      }
    } finally {
      setCreating(false);
    }
  };

  // ---------- session timer (legacy workout-header-card logic) ----------
  const toggleTimer = async () => {
    if (!workout) return;
    if (!workout.startAt || workout.endAt) {
      const startAt = new Date().toISOString();
      await mutate({
        label: "Workout timer started",
        run: () => workoutsApi.update(workout.id, { startAt }),
        queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { startAt } },
      });
      toast.success("Timer started");
    } else {
      const endAt = new Date().toISOString();
      await mutate({
        label: "Workout timer stopped",
        run: () => workoutsApi.update(workout.id, { endAt }),
        queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { endAt } },
      });
      toast.success("Timer stopped");
    }
  };

  // ---------- set/exercise mutations (legacy track-tab logic) ----------
  const patchSet = async (we: WorkoutExerciseDTO, setId: string, patch: SetInput) => {
    if (!workout) return;
    await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(workout.id, we.id, setId, patch),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${setId}`,
        method: "PATCH",
        body: patch,
      },
    });
  };

  const addSetToCard = async (we: WorkoutExerciseDTO) => {
    if (!workout) return;
    const ex = we.exercise;
    const payload: SetInput = {
      weight: null,
      reps: null,
      distance: null,
      timeSec: null,
      setType: ex.defaultSetType ?? "NORMAL",
      rpe: ex.defaultRpeTarget ?? null,
      tempo: ex.defaultTempo ?? null,
      restPlannedSec: ex.restSec ?? null,
    };
    const created = await mutate({
      label: "Set saved",
      run: () => workoutsApi.addSet(workout.id, we.id, payload),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}/sets`,
        method: "POST",
        body: payload,
      },
    });
    if (!created) return; // queued offline
    if (created.newPr) {
      toast.success("New personal record!", {
        description: `${created.reps} reps at ${created.weight} — best ever`,
      });
    } else {
      toast.success("Set added");
    }
  };

  const toggleSetDone = async (we: WorkoutExerciseDTO, set: SetDTO) => {
    if (!workout) return;
    const next = !set.isComplete;
    const updated = await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(workout.id, we.id, set.id, { isComplete: next }),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`,
        method: "PATCH",
        body: { isComplete: next },
      },
    });
    // ticking ✓ starts the rest clock (warm-ups excluded) — legacy rules
    if (updated && next && (set.setType ?? "NORMAL") !== "WARMUP" && !set.isWarmup) {
      if (settings?.autoRestFromRow ?? true) {
        const restSec = set.restPlannedSec ?? we.exercise.restSec ?? null;
        if (restSec && restSec > 0) rest.start(restSec, set.id);
        else if (rest.everStarted) rest.start(undefined, set.id);
      } else if (rest.everStarted) {
        rest.start(undefined, set.id);
      }
    }
  };

  const copyLast = async (we: WorkoutExerciseDTO, setId: string) => {
    const sorted = [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === setId);
    if (idx < 0) return;
    const src = [...sorted.slice(0, idx)]
      .reverse()
      .find((s) => s.weight != null || s.reps != null || s.distance != null || s.timeSec != null);
    if (!src) {
      toast.info("No earlier set to copy from");
      return;
    }
    await patchSet(we, setId, {
      weight: src.weight,
      reps: src.reps,
      distance: src.distance,
      timeSec: src.timeSec,
      rpe: src.rpe ?? null,
      tempo: src.tempo ?? null,
      restPlannedSec: src.restPlannedSec ?? null,
    });
    toast.success("Copied from previous set");
  };

  const moveExercise = async (we: WorkoutExerciseDTO, delta: -1 | 1) => {
    if (!workout) return;
    const ids = [...workout.exercises]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((w) => w.id);
    const i = ids.indexOf(we.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await mutate({
      label: "Exercise order saved",
      run: () => workoutsApi.reorderExercises(workout.id, ids),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/order`,
        method: "PUT",
        body: { ids },
      },
    });
  };

  const removeExercise = async (weId: string) => {
    if (!workout) return;
    await mutate({
      label: "Exercise removed",
      run: () => workoutsApi.removeExercise(workout.id, weId),
      queue: { path: `/api/workouts/${workout.id}/exercises/${weId}`, method: "DELETE" },
    });
    toast.success("Exercise removed");
  };

  // ---------- card mapping ----------
  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const toCardExercise = (we: WorkoutExerciseDTO): CardExercise => ({
    id: we.id,
    name: we.exercise.name,
    categoryLabel: we.exercise.category?.name ?? "Exercise",
    categoryColour: we.exercise.category?.colour ?? "#71717a",
    modality: we.exercise.type,
    unit: exerciseUnit(we.exercise, settings),
    weightIncrement: we.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  });

  const cardSets = (we: WorkoutExerciseDTO): CardSet[] =>
    [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => toCardSet(s, i + 1));

  const handleCardAction =
    (we: WorkoutExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "toggle-collapse":
          setCollapsedIds((prev) => {
            const next = new Set(prev);
            if (next.has(we.id)) next.delete(we.id);
            else next.add(we.id);
            return next;
          });
          break;
        case "add-set":
          void addSetToCard(we);
          break;
        case "update-set":
          void patchSet(we, action.setId, cardPatchToSetInput(action.patch));
          break;
        case "toggle-done": {
          const set = we.sets.find((s) => s.id === action.setId);
          if (set) void toggleSetDone(we, set);
          break;
        }
        case "copy-last":
          void copyLast(we, action.setId);
          break;
        case "notes":
          setNotesWeId(we.id);
          break;
        case "rest-timer":
          rest.start(we.exercise.restSec ?? undefined, action.setId ?? null);
          break;
        case "move-up":
          void moveExercise(we, -1);
          break;
        case "move-down":
          void moveExercise(we, 1);
          break;
        case "add-to-group":
          setGroupWeId(we.id);
          break;
        case "replace":
          // p3-4: the picker opens in replace mode with the day context
          navigate(`/exercises?replace=${we.id}&date=${dateKey}`);
          break;
        case "remove":
          setRemoveWeId(we.id);
          break;
        case "select":
          // multi-select omitted in the p3-3 Today rebuild (see report)
          toast.info("Multi-select arrives with the next build");
          break;
        case "open":
          // p3-4 "Focus view" — carry the day context into the training screen
          navigate(`/today/${we.id}?date=${dateKey}`);
          break;
        case "toggle-select":
          break; // preview-mode only; edit rows never emit it
      }
    };

  const restActive = rest.remainingSec != null;

  // ---------- render ----------
  return (
    <Screen
      topBar={
        <TopBar
          title="SetForge"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Calendar"
                onClick={() => navigate("/calendar")}
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
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
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate("/history")}>
                    <History className="h-4 w-4" aria-hidden /> History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/exercises")}>
                    <Dumbbell className="h-4 w-4" aria-hidden /> Exercises
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/tools")}>
                    <Wrench className="h-4 w-4" aria-hidden /> Tools
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="h-4 w-4" aria-hidden /> Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      }
      subBar={<DateStrip dateKey={dateKey} onChange={goTo} workoutExists={!!workout} />}
      bottomBar={
        <BottomBar>
          {restActive ? (
            <RestBar
              display={formatDuration(rest.remainingSec ?? 0)}
              onAdjust={rest.adjust}
              onSkip={rest.skip}
            />
          ) : (
            <AddExerciseBar onAdd={() => navigate(`/exercises?date=${dateKey}`)} />
          )}
        </BottomBar>
      }
    >
      <ScrollBody>
        {isLoading ? (
          <DaySkeleton />
        ) : !workout ? (
          <TodayEmpty
            hasPrevious={hasPrevious}
            starting={creating}
            onStartNew={() => void startNewWorkout()}
            onCopyPrevious={() => void copyPreviousWorkout()}
          />
        ) : (
          <>
            <MetaRow
              workout={workout}
              restRemainingSec={rest.remainingSec}
              onToggleTimer={() => void toggleTimer()}
            />

            {exercises.map((we) => {
              const group = we.groupId ? groupById.get(we.groupId) ?? null : null;
              return (
                <div key={we.id} className="relative flex-none">
                  <ExerciseCard
                    mode="edit"
                    exercise={toCardExercise(we)}
                    sets={cardSets(we)}
                    collapsed={collapsedIds.has(we.id)}
                    visibleColumns={visibleColumns}
                    groupColour={group?.colour}
                    groupName={group?.name}
                    onAction={handleCardAction(we)}
                  />
                  {notesWeId === we.id && (
                    <ExerciseNotesPopover
                      exercise={we.exercise}
                      open
                      onClose={() => setNotesWeId(null)}
                    />
                  )}
                  {groupWeId === we.id && (
                    <ExerciseGroupPopover
                      workout={workout}
                      we={we}
                      open
                      onClose={() => setGroupWeId(null)}
                    />
                  )}
                </div>
              );
            })}

            <SummaryRow workout={workout} unit={defaultUnitFor(settings)} />

            {/* bottom breathing spacer — bars are flex siblings, nothing to clear */}
            <div className="h-4 flex-none" aria-hidden />

            <ConfirmRemoveExercise
              exerciseName={removeWe?.exercise.name ?? ""}
              open={removeWeId != null}
              onClose={() => setRemoveWeId(null)}
              onConfirm={async () => {
                const id = removeWeId;
                setRemoveWeId(null);
                if (id) await removeExercise(id);
              }}
            />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}

function DaySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading day">
      <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}
