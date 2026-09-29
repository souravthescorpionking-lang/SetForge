"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TodayScreen — the Part 3 rebuild of the day view (#/today), composed ONLY
// from the layout primitives (Screen/TopBar/SubBar/ScrollBody/BottomBar/NavBar)
// and the ONE ExerciseCard (edit mode) from @/components/exercise-card.
//
//   TopBar (56)  : brand "SetForge" · Calendar action · ⋮ menu (+ Arrange)
//   SubBar (48)  : DateStrip ◄ [Thu 25 Sep] ► + Today chip + §4.11 4px sets bar
//   ScrollBody   : [§4.11 RestRingBlock while resting · RING] → MetaRow →
//                  ExerciseCard×N → SummaryRow → spacer (or ONE 200px empty-state
//                  block on days with no workout)
//   BottomBar(56): content swaps — RestBar (rest running) | GuidedBar (§4.11
//                  guided mode, workout unfinished) | FinishedBar | FinishBar |
//                  AddExerciseBar (never more than one)
//
// Part 6 §4.11 (each behind its setting — defaults preserve Part 5 behaviour):
//   • guidedMode  — pointer over guidedPointerOrder (ungrouped sequential, then
//                   per-group round-robin); Prev/Log set/Next BottomBar; pointer
//                   chip in MetaRow; ring-2 highlight on the current card +
//                   scrollIntoView (prefers-reduced-motion aware).
//   • autoMoveNextSet — rest-completion callback advances the pointer.
//   • restDisplay=RING — RestRingBlock as the first ScrollBody child while
//                   resting (RestBar stays in the BottomBar).
//   • finishBehaviour=ASK — Finish → Save/Discard AlertDialogs (finish-ask.tsx).
//   • showSetsProgressBar — DateStrip 4px bar + MetaRow `n/n sets` chip.
//   • showMaxWeightBar — `Best W×R` metaExtra line from exercisesApi.records.
//   • showVideoPanel — MediaBlock underHeader on the CURRENT guided card.
//   • trainer tips — MetaRow “Tip” chip toggles per-card tip rows (underHeader).
//   • groupCode chips via computeGroupCodes (§4.10 codes on today cards).
//
// Data/mutation logic is REUSED from the legacy today feature (today-view /
// track-tab / workout-header-card): useWorkoutByDate + use-mutate (offline
// outbox), toggle-timer, add/patch/toggle sets with auto-rest, reorder
// exercises, group membership, start/copy workout. The rest engine is
// extracted into ./rest-state (no rendering — the BottomBar shows it).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import {
  ExerciseCard,
  toCardSet,
  type CardAction,
  type CardExercise,
  type CardSet,
  type CardVisibleColumns,
} from "@/components/exercise-card/exercise-card";
import { trimNum } from "@/components/exercise-card/card-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownUp,
  CalendarDays,
  Dumbbell,
  History,
  MoreVertical,
  Settings,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { ApiError, exercisesApi, routinesApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { hapticSuccess } from "@/lib/client/haptics";
import { computeGroupCodes, guidedPointerOrder } from "@/lib/group-codes";
import { qk, useInvalidate, useOnline, useWorkoutByDate } from "@/lib/client/query";
import { addDaysKey, todayKey } from "@/lib/client/format";
import { formatDuration } from "@/lib/formulas";
import { useHashRoute } from "@/features/shell/router";
import { defaultUnitFor, exerciseUnit } from "@/features/exercises/labels";
import { useSessionFromWorkout } from "@/features/routines/session-dialog";
import type { RecordsDTO, SetDTO, WorkoutExerciseDTO, WorkoutGroupDTO } from "@/lib/types";
import { useMutate } from "./use-mutate";
import { useRestState } from "./rest-state";
import { DateStrip } from "./date-strip";
import { MetaRow } from "./meta-row";
import { SummaryRow } from "./summary-row";
import { TodayEmpty } from "./today-empty";
import { AddExerciseBar, FinishBar, FinishedBar, RestBar } from "./rest-bar";
import { GuidedBar } from "./guided-bar";
import { RestRingBlock } from "./rest-ring-block";
import { TrainerTipRow } from "./tip-row";
import { GuidedVideoPanel } from "./guided-video-panel";
import { FinishAskFlow } from "./finish-ask";
import {
  ConfirmRemoveExercise,
  ExerciseGroupPopover,
  ExerciseNotesPopover,
} from "./card-popovers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Part 7 LAW 2 — the screen's tour/help contract lives in the screen slot
// (src/features/screens/today.tsx); this module only declares the inline
// steps (today.* + the exerciseCard.* underHeader anchors below).

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

/** §4.11 showMaxWeightBar — "Best 110×5" from the exercise's record table
 *  (max-weight entry; ties break to the higher rep count). */
function bestSetLine(records: RecordsDTO | undefined): string | null {
  if (!records) return null;
  const usable = records.actual.filter((r) => r.weight != null && r.weight > 0 && r.reps != null);
  const rows = usable.some((r) => !r.superseded) ? usable.filter((r) => !r.superseded) : usable;
  if (rows.length === 0) return null;
  let best = rows[0];
  for (const r of rows) {
    if (r.weight! > best.weight! || (r.weight === best.weight && r.reps! > best.reps!)) best = r;
  }
  return `Best ${trimNum(best.weight!)}×${best.reps!}`;
}

export default function TodayScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const route = useHashRoute();
  const invalidate = useInvalidate();
  const online = useOnline();
  const mutate = useMutate();
  const sessionFromWorkout = useSessionFromWorkout();

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

  // routines cache — resolves the workout's source chip (routine · day names)
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const source = useMemo(() => {
    if (!workout?.sourceRoutineId) return null;
    if (workout.sourceType !== "ROUTINE_DAY" && workout.sourceType !== "SESSION") return null;
    const r = routinesQuery.data?.routines.find((x) => x.id === workout.sourceRoutineId);
    if (!r) return null;
    if (workout.sourceType === "SESSION") {
      return { label: `Session · ${r.name}`, routineId: r.id };
    }
    const day = r.days.find((d) => d.id === workout.sourceDayId);
    return { label: day ? `${r.name} · ${day.name}` : r.name, routineId: r.id };
  }, [workout, routinesQuery.data]);

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
  // §4.11 local toggles: trainer-tip rows, finishBehaviour=ASK dialog stage
  const [tipsOpen, setTipsOpen] = useState(false);
  const [finishAskOpen, setFinishAskOpen] = useState(false);
  const [guidedIdx, setGuidedIdx] = useState(0);

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

  // ---------- §4.11 guided mode: pointer over guidedPointerOrder ----------
  // Ungrouped exercises run sequentially first, then each group round-robins
  // (A1s1, A2s1, A1s2…). The pointer ALWAYS targets an incomplete set — the
  // skip-effect below advances it past anything already logged (on load, on
  // cache updates and when a set is un-ticked back to incomplete at the end).
  const guidedActive =
    !!settings?.guidedMode && !!workout && !workout.finishedAt && exercises.length > 0;

  const sortedSetsByWe = useMemo(() => {
    const m = new Map<string, SetDTO[]>();
    for (const we of exercises) {
      m.set(we.id, [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder));
    }
    return m;
  }, [exercises]);

  const pointerOrder = useMemo(
    () =>
      guidedActive
        ? guidedPointerOrder(
            exercises.map((we) => ({ id: we.id, groupId: we.groupId, setCount: we.sets.length })),
          )
        : [],
    [guidedActive, exercises],
  );

  const isPointerComplete = useCallback(
    (i: number): boolean => {
      const p = pointerOrder[i];
      if (!p) return false;
      return !!sortedSetsByWe.get(p.exerciseId)?.[p.setIndex]?.isComplete;
    },
    [pointerOrder, sortedSetsByWe],
  );

  // keep the pointer on an incomplete set (or "all done" == length)
  useEffect(() => {
    if (!guidedActive) return;
    setGuidedIdx((cur) => {
      if (cur >= pointerOrder.length) {
        // "all done" — a set may have been un-ticked back to incomplete
        const firstIncomplete = pointerOrder.findIndex((_, i) => !isPointerComplete(i));
        return firstIncomplete >= 0 ? firstIncomplete : pointerOrder.length;
      }
      let i = cur;
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      return i;
    });
  }, [guidedActive, pointerOrder, isPointerComplete]);

  /** Advance past `from` to the next incomplete pointer (used by Log set). */
  const advanceGuidedPast = useCallback(
    (from: number) => {
      setGuidedIdx(() => {
        let i = from;
        while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
        return Math.min(i, pointerOrder.length);
      });
    },
    [pointerOrder, isPointerComplete],
  );

  /** §4.11 autoMoveNextSet — rest ended naturally: advance + scroll into view. */
  const handleRestComplete = useCallback(() => {
    if (!(settings?.guidedMode && settings?.autoMoveNextSet)) return;
    setGuidedIdx((cur) => {
      if (cur >= pointerOrder.length) return cur;
      let i = cur;
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      return Math.min(i, pointerOrder.length);
    });
  }, [settings?.guidedMode, settings?.autoMoveNextSet, pointerOrder, isPointerComplete]);

  const rest = useRestState({ onComplete: handleRestComplete });

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

  /** Complete/un-complete a set. Returns true when the completion was sent
   *  (online) — false when queued offline or the request failed, so the
   *  guided "Log set" pointer only advances on a logged set. */
  const toggleSetDone = async (we: WorkoutExerciseDTO, set: SetDTO): Promise<boolean> => {
    if (!workout) return false;
    const next = !set.isComplete;
    if (next) hapticSuccess(); // §4.17 — set complete (row ✓ and guided Log set)
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
    return !!updated && next;
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

  // ---------- §4.11 guided actions (BottomBar Prev / Log set / Next) ----------

  /** Manual pointer move — skips complete sets in the movement direction. */
  const moveGuided = (delta: 1 | -1) => {
    setGuidedIdx((cur) => {
      let i = cur + delta;
      while (i >= 0 && i < pointerOrder.length && isPointerComplete(i)) i += delta;
      return Math.max(0, Math.min(i, pointerOrder.length));
    });
  };

  /** "Log set" — complete the current set via the EXISTING toggle-done
   *  mutation (auto-rest per autoRestFromRow), then optimistically advance
   *  the pointer past it — but only when the completion actually went out
   *  (offline-queued or failed sets keep the pointer where it is; the
   *  skip-effect advances it once the cache catches up). */
  const logGuidedSet = async () => {
    const p = pointerOrder[guidedIdx];
    if (!p) return;
    const we = exercises.find((w) => w.id === p.exerciseId);
    const set = sortedSetsByWe.get(p.exerciseId)?.[p.setIndex];
    if (!we || !set || set.isComplete) return;
    const logged = await toggleSetDone(we, set);
    if (logged) advanceGuidedPast(guidedIdx + 1);
  };

  // card element registry — the guided pointer scrolls the current card into view
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (!guidedActive) return;
    const p = pointerOrder[guidedIdx];
    if (!p) return;
    const el = cardRefs.current.get(p.exerciseId);
    if (!el) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [guidedActive, guidedIdx, pointerOrder]);

  // ---------- §4.11 derived card data ----------

  /** §4.10 group codes for today's cards (A1/A2… on superset members). */
  const groupCodes = useMemo(() => computeGroupCodes(exercises), [exercises]);

  const guidedCardWeId = guidedIdx < pointerOrder.length ? pointerOrder[guidedIdx].exerciseId : null;
  const guidedAllDone = guidedActive && guidedIdx >= pointerOrder.length;
  const guidedLabel = (() => {
    if (!guidedActive) return null;
    if (guidedAllDone) return "All sets done";
    const p = pointerOrder[guidedIdx];
    const code = groupCodes.codes.get(p.exerciseId);
    const total = sortedSetsByWe.get(p.exerciseId)?.length ?? 0;
    return code ? `${code} · set ${p.setIndex + 1}/${total}` : `set ${p.setIndex + 1}/${total}`;
  })();

  /** §4.11 sets progress — non-warmup performed sets / total sets. */
  const setsProgress = useMemo(() => {
    if (!workout) return null;
    let total = 0;
    let completed = 0;
    for (const we of workout.exercises) {
      for (const s of we.sets) {
        total += 1;
        if (s.isComplete && !s.isWarmup && (s.setType ?? "NORMAL") !== "WARMUP") completed += 1;
      }
    }
    return total > 0 ? { completed, total } : null;
  }, [workout]);

  /** §4.11 showMaxWeightBar — "Best W×R" per exercise from its records. */
  const showBestLine = !!settings?.showMaxWeightBar;
  const recordsQueries = useQueries({
    queries: exercises.map((we) => ({
      queryKey: qk.exerciseRecords(we.exerciseId),
      queryFn: () => exercisesApi.records(we.exerciseId),
      enabled: showBestLine,
      staleTime: 60_000,
    })),
  });
  const bestByWeId = useMemo(() => {
    const m = new Map<string, string>();
    if (!showBestLine) return m;
    exercises.forEach((we, i) => {
      const line = bestSetLine(recordsQueries[i]?.data);
      if (line) m.set(we.id, line);
    });
    return m;
  }, [showBestLine, exercises, recordsQueries]);

  /** Any card has a trainer tip → the MetaRow "Tip" chip renders. */
  const anyTips = exercises.some((we) => !!we.exercise.trainerTip);

  // ---------- Part 5: finish / undo-finish ----------
  const finishWorkout = async () => {
    if (!workout || !online) {
      if (!online) toast.info("Finishing needs a connection");
      return;
    }
    try {
      const res = await workoutsApi.finish(workout.id);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      invalidate.programs();
      // "Day X up next" — index comes from the routine days (fallback: name)
      let nextLabel = "Done";
      if (res.nextDay) {
        const routine = routinesQuery.data?.routines.find(
          (r) => r.id === workout.sourceRoutineId,
        );
        const idx = routine?.days.findIndex((d) => d.id === res.nextDay?.id) ?? -1;
        nextLabel = idx >= 0 ? `Day ${idx + 1} up next` : `${res.nextDay.name} up next`;
      }
      toast.success(`Workout finished · ${nextLabel}`, {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => void undoFinish(workout.id),
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish workout");
    }
  };

  const undoFinish = async (workoutId: string) => {
    try {
      await workoutsApi.undoFinish(workoutId);
      invalidate.workout();
      invalidate.dashboard();
      invalidate.schedule();
      invalidate.programs();
      toast.success("Finish undone — keep logging");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        toast.info("Too late to undo (past the 10s window)");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not undo");
      }
    }
  };

  // §4.11 finishBehaviour — ALWAYS_SAVE (default) finishes directly; ASK opens
  // the Save/Discard dialogs (finish-ask.tsx).
  const handleFinishPressed = () => {
    if (settings?.finishBehaviour === "ASK") setFinishAskOpen(true);
    else void finishWorkout();
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
  // §4.11 RING display — in-flow block while resting (RestBar stays too)
  const ringRestActive = restActive && settings?.restDisplay === "RING";

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
                tour={{ id: "today.calendar", label: "Calendar", help: "Open the calendar to jump to another day.", order: 10 }}
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
                    tour={{ id: "today.menu", label: "Day menu", help: "Save as session, arrange, history, tools or settings.", order: 20 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {workout && workout.exercises.length > 0 ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => sessionFromWorkout.openFor(workout.id, dateKey)}
                      >
                        <Dumbbell className="h-4 w-4" aria-hidden /> Save as session
                      </DropdownMenuItem>
                      {/* §4.10c — today's arrange screen (6-d) */}
                      <DropdownMenuItem
                        onClick={() =>
                          navigate(
                            dateKey === todayKey() ? "/today/arrange" : `/today/arrange?date=${dateKey}`,
                          )
                        }
                      >
                        <ArrowDownUp className="h-4 w-4" aria-hidden /> Arrange exercises
                      </DropdownMenuItem>
                    </>
                  ) : null}
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
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <DateStrip
          dateKey={dateKey}
          onChange={goTo}
          workoutExists={!!workout}
          progress={settings?.showSetsProgressBar !== false ? setsProgress : null}
        />
      }
      bottomBar={
        <BottomBar>
          {restActive ? (
            <RestBar
              display={formatDuration(rest.remainingSec ?? 0)}
              onAdjust={rest.adjust}
              onSkip={rest.skip}
            />
          ) : workout?.finishedAt ? (
            // finished — single disabled confirmation row
            <FinishedBar />
          ) : guidedActive ? (
            // §4.11 guided mode — Prev / Log set / Next replaces Add/Finish
            <GuidedBar
              onPrev={() => moveGuided(-1)}
              onNext={() => moveGuided(1)}
              onLog={() => void logGuidedSet()}
              onFinish={handleFinishPressed}
              canLog={guidedIdx < pointerOrder.length && !isPointerComplete(guidedIdx)}
              allDone={guidedAllDone}
              atStart={guidedIdx <= 0}
            />
          ) : workout && workout.exercises.length > 0 ? (
            // logging in progress — two equal actions
            <FinishBar
              onAdd={() => navigate(`/exercises?date=${dateKey}`)}
              onFinish={handleFinishPressed}
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
            {/* §4.11 RING rest display — FIRST child, pushes content down,
                removed when rest ends (no overlay; RestBar stays in the BottomBar) */}
            {ringRestActive ? (
              <RestRingBlock
                remainingSec={rest.remainingSec ?? 0}
                totalSec={rest.totalSec}
                onAdjust={rest.adjust}
                onSkip={rest.skip}
              />
            ) : null}

            <MetaRow
              workout={workout}
              source={source}
              restRemainingSec={rest.remainingSec}
              onToggleTimer={() => void toggleTimer()}
              setsProgress={settings?.showSetsProgressBar !== false ? setsProgress : null}
              guidedPointer={guidedLabel}
              tipToggle={
                anyTips ? { open: tipsOpen, onToggle: () => setTipsOpen((v) => !v) } : null
              }
            />

            {exercises.map((we) => {
              const group = we.groupId ? groupById.get(we.groupId) ?? null : null;
              const isCurrentGuidedCard = guidedCardWeId === we.id;
              // §4.11 guided video panel — only the CURRENT guided card, only
              // when a video exists (MediaBlock itself collapses to 0px otherwise)
              const showGuidedVideo =
                isCurrentGuidedCard && !!settings?.showVideoPanel && !!we.exercise.videoUrl;
              const showTipRow = tipsOpen && !!we.exercise.trainerTip;
              const underHeader =
                showGuidedVideo || showTipRow ? (
                  <>
                    {showGuidedVideo ? (
                      // Part 7 — exerciseCard.mediaBlock anchor (the block itself
                      // is consumer-supplied via the underHeader slot).
                      <div
                        {...tourAttrs({ id: "exerciseCard.mediaBlock", label: "Form video", help: "Guided demo video for the current exercise.", order: 140, when: ["guided"] })}
                      >
                        <GuidedVideoPanel weId={we.id} videoUrl={we.exercise.videoUrl} height={180} />
                      </div>
                    ) : null}
                    {showTipRow ? (
                      // Part 7 — exerciseCard.tipRow anchor (same slot contract).
                      <div
                        {...tourAttrs({ id: "exerciseCard.tipRow", label: "Trainer tip", help: "Coaching cue for this exercise; tap to expand.", order: 150 })}
                      >
                        <TrainerTipRow tip={we.exercise.trainerTip!} />
                      </div>
                    ) : null}
                  </>
                ) : undefined;
              return (
                <div
                  key={we.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(we.id, el);
                    else cardRefs.current.delete(we.id);
                  }}
                  className="relative flex-none"
                >
                  <ExerciseCard
                    mode="edit"
                    exercise={toCardExercise(we)}
                    sets={cardSets(we)}
                    collapsed={collapsedIds.has(we.id)}
                    visibleColumns={visibleColumns}
                    groupColour={group?.colour}
                    groupName={group?.name}
                    groupCode={groupCodes.codes.get(we.id)}
                    metaExtra={bestByWeId.get(we.id)}
                    underHeader={underHeader}
                    className={isCurrentGuidedCard ? "ring-2 ring-primary/40" : undefined}
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

            {/* Part 7 — today.summary anchor (SummaryRow is a display-only row;
                the wrapper carries the declaration without touching it). */}
            <div
              {...tourAttrs({ id: "today.summary", label: "Day summary", help: "Sets, volume and PRs logged for the day.", order: 70, when: ["populated"] })}
            >
              <SummaryRow workout={workout} unit={defaultUnitFor(settings)} />
            </div>

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

            {/* §4.11 finishBehaviour=ASK — Save/Discard dialogs (mounted only
                while the ASK stage is open; ALWAYS_SAVE never reaches it) */}
            {settings?.finishBehaviour === "ASK" ? (
              <FinishAskFlow
                workout={workout}
                open={finishAskOpen}
                onClose={() => setFinishAskOpen(false)}
                onSave={() => void finishWorkout()}
                dateKey={dateKey}
                onDiscarded={() => {
                  // a discarded day can't keep a rest countdown running
                  rest.skip();
                  setFinishAskOpen(false);
                }}
              />
            ) : null}

            {sessionFromWorkout.dialog}
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
