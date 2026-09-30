"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionScreen — #/session (Part 8 §3.10 Logging, §6.1 auto mode, §6.5
// transition rest, §6.9 exit flows). Evolved from the Part 6/7 today-screen
// logger (guided pointer, rest engine, mutate hooks, undo toasts) with the
// card system swapped to the ONE GroupCard in log mode.
//
//   TopBar (56)  : ✕ → menu (Finish · Discard · Keep going — §6.9) ·
//                  "{name} · {elapsed}" (live timer from startAt; tap to start
//                  when unset) · ⋮ (Note · Reorder → #/session/arrange · Group ·
//                  Replace exercise · Save as session · Transition rest §6.5)
//   Progress (32): 4px-tall sets bar + "{done}/{total} sets" (reuse §4.11 logic)
//   ScrollBody   : [RestRingBlock while resting · RING] → GroupCard ×N in LOG
//                  mode inside GroupCardStack (deriveGroups + memberCode;
//                  entries carry currentSetIndex from the guided pointer —
//                  SetRow renders the 3px accent bar). Exercises whose sets
//                  are all complete render collapsed ("3/3").
//   BottomBar(56): content swaps — RestBar (rest running; `Next: …` label when
//                  the rest was started by a §6.5 group transition) |
//                  FinishedBar (post-finish window) | AddExerciseBar (no
//                  exercises) | LogBar `[ + Add exercise ] [ Log set ✓ ]`
//                  (guided completes the pointer set; free mode the first
//                  incomplete set; all done → primary becomes Finish).
//
// §6.1 AUTO mode: settings.sessionMode (AUTO|GUIDED|FREE, default AUTO).
//   effective guided = sessionMode==="GUIDED" ||
//                      (sessionMode==="AUTO" && sourceType!=="FREESTYLE")
//   (supersedes the legacy guidedMode boolean).
// §6.5 transition rest: completing the LAST set of a group (pointer crossing
//   a group boundary) starts the rest timer with the transition duration
//   sessionOverride ?? nextExercise.transitionRestSec ??
//   settings.defaultTransitionRestSec (0 = off → legacy per-set rest rules)
//   and the RestBar labels `Next: {name}`.
// §6.9 exit: Finish saves (+ Undo toast); Discard = destructive confirm →
//   workoutLifecycleApi.discard (reverts cursor/schedule) → #/workout + Undo;
//   Keep going dismisses.
//
// Gate: no active session (workoutsApi.active() null AND today has no
// unfinished workout) → replaceHash("#/workout"). Reachable ONLY via
// Start/Continue — NO NavBar (nav={false}).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import { GroupCard, GroupCardStack, toCardSet } from "@/components/group-card";
import type {
  ApplyToAllFields,
  CardAction,
  CardExercise,
  CardSet,
  CardVisibleColumns,
} from "@/components/group-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownUp,
  BookmarkPlus,
  Dumbbell,
  Flag,
  Link2,
  MessageSquareText,
  MoreVertical,
  Replace,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { ApiError, dayApi, routinesApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { hapticSuccess, hapticWarning } from "@/lib/client/haptics";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { guidedPointerOrder } from "@/lib/group-codes";
import { qk, useInvalidate, useOnline, useWorkoutByDate } from "@/lib/client/query";
import { dayKeyOf, todayKey } from "@/lib/client/format";
import { replaceHash } from "@/features/shell/router";
import { formatDuration } from "@/lib/formulas";
import { useSessionFromWorkout } from "@/features/routines/session-dialog";
import { exerciseUnit } from "@/features/exercises/labels";
import type { SetDTO, SettingsDTO, WorkoutDTO, WorkoutExerciseDTO } from "@/lib/types";
import { useMutate } from "./use-mutate";
import { useRestState } from "./rest-state";
import { AddExerciseBar, FinishedBar, LogBar, RestBar } from "./bars";
import { RestRingBlock } from "./rest-ring-block";
import {
  ConfirmRemoveExercise,
  ExerciseGroupPopover,
  ExerciseNotesPopover,
} from "./card-popovers";
import {
  DiscardConfirmDialog,
  NotePopover,
  TransitionRestPopover,
} from "./screen-popovers";

/** Map a CardSet patch (SetRow/GroupCard contract) onto the API's SetInput. */
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

/** 1 Hz re-render while the session timer runs (elapsed title). */
function useTicker(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** §4.11 sets progress — non-warmup performed sets / total sets. */
function setsProgressOf(workout: WorkoutDTO): { completed: number; total: number } | null {
  let total = 0;
  let completed = 0;
  for (const we of workout.exercises) {
    for (const s of we.sets) {
      total += 1;
      if (s.isComplete && !s.isWarmup && (s.setType ?? "NORMAL") !== "WARMUP") completed += 1;
    }
  }
  return total > 0 ? { completed, total } : null;
}

/** WorkoutExerciseDTO → CardExercise (Part 8 per-exercise column flags included). */
function toCardExercise(we: WorkoutExerciseDTO, settings: SettingsDTO | null): CardExercise {
  const ex = we.exercise;
  return {
    id: we.id,
    name: ex.name,
    categoryLabel: ex.category?.name ?? "Exercise",
    categoryColour: ex.category?.colour ?? "#71717a",
    modality: ex.type,
    unit: exerciseUnit(ex, settings),
    weightIncrement: ex.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
    showRpe: ex.showRpe,
    showTempo: ex.showTempo,
    showRest: ex.showRest,
    transitionRestSec: ex.transitionRestSec,
  };
}

/** SetDTO → CardSet (distance km→m so cardio rows read "6.5 km"). */
function cardSetsOf(we: WorkoutExerciseDTO): CardSet[] {
  return [...we.sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) =>
      toCardSet({ ...s, distance: s.distance != null ? s.distance * 1000 : null }, i + 1),
    );
}

export default function SessionScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
  const invalidate = useInvalidate();
  const online = useOnline();
  const mutate = useMutate();
  const sessionFromWorkout = useSessionFromWorkout();

  // ---------- gate + data (§3.10): today's unfinished session, else the
  // active one (any date); neither → redirect to #/workout ----------
  const today = todayKey();
  const byDateQuery = useWorkoutByDate(today);
  const activeQuery = useQuery({
    queryKey: ["workout", "active"],
    queryFn: () => workoutsApi.active(),
    staleTime: 15_000,
  });
  const usable = (w: WorkoutDTO | null | undefined): WorkoutDTO | null =>
    w && !w.finishedAt && w.removedAt == null ? w : null;
  const workout = usable(byDateQuery.data?.workout) ?? usable(activeQuery.data?.workout) ?? null;
  const loading = byDateQuery.isLoading || activeQuery.isLoading;

  useEffect(() => {
    if (!loading && !workout) replaceHash("#/workout");
  }, [loading, workout]);

  const dayKey = workout ? dayKeyOf(workout.date) : today;

  // routines cache — resolves the session name (routine · day names)
  const routinesQuery = useQuery({ queryKey: qk.routines, queryFn: () => routinesApi.list() });
  const source = useMemo(() => {
    if (!workout?.sourceRoutineId) return null;
    if (workout.sourceType !== "ROUTINE_DAY" && workout.sourceType !== "SESSION") return null;
    const r = routinesQuery.data?.routines.find((x) => x.id === workout.sourceRoutineId);
    if (!r) return null;
    if (workout.sourceType === "SESSION") return { routineName: r.name, dayName: null as string | null };
    const day = r.days.find((d) => d.id === workout.sourceDayId);
    return { routineName: r.name, dayName: day?.name ?? null };
  }, [workout, routinesQuery.data]);
  const sessionName = source?.dayName ?? source?.routineName ?? "Freestyle session";

  // §5.4: the source day's DayOverride notes render as one line under each
  // exercise header (GroupCard entry.note). The day query rides the same
  // cached chain the day overview uses (qk.day).
  const dayNotesQuery = useQuery({
    queryKey: qk.day(workout?.sourceDayId ?? ""),
    queryFn: () => dayApi.get(workout!.sourceDayId!),
    enabled: workout?.sourceDayId != null,
    staleTime: 60_000,
  });
  const noteByExerciseId = useMemo(() => {
    const m = new Map<string, string>();
    for (const ex of dayNotesQuery.data?.exercises ?? []) {
      if (!ex.note) continue;
      // effective id first, then the template id it replaced (started-before-
      // replace workouts still carry the template exercise)
      if (!m.has(ex.exerciseId)) m.set(ex.exerciseId, ex.note);
      if (ex.replacedExerciseId && !m.has(ex.replacedExerciseId)) m.set(ex.replacedExerciseId, ex.note);
    }
    return m;
  }, [dayNotesQuery.data]);

  // ---------- ui state ----------
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [notesWeId, setNotesWeId] = useState<string | null>(null);
  const [groupWeId, setGroupWeId] = useState<string | null>(null);
  const [removeWeId, setRemoveWeId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  /** §6.5 per-session transition rest override (null = exercise ?? settings),
   *  persisted in localStorage per workout id so it survives route hops. */
  const [sessionTransitionSec, setSessionTransitionSec] = useState<number | null>(null);
  /** RestBar label while a §6.5 transition rest runs ("Next: Barbell Curl"). */
  const [restLabelState, setRestLabelState] = useState<string | null>(null);
  const [guidedIdx, setGuidedIdx] = useState(0);

  const exercises = useMemo(
    () => (workout ? [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [workout],
  );
  const groupById = useMemo(() => {
    const m = new Map<string, WorkoutDTO["groups"][number]>();
    for (const g of workout?.groups ?? []) m.set(g.id, g);
    return m;
  }, [workout]);
  const groups = useMemo(() => deriveGroups(exercises), [exercises]);
  const weById = useMemo(() => new Map(exercises.map((we) => [we.id, we])), [exercises]);
  /** deriveGroups group key for an exercise (groupId ?? solo:id). */
  const groupKeyOf = useCallback(
    (weId: string): string => {
      const we = weById.get(weId);
      return we?.groupId ?? `solo:${weId}`;
    },
    [weById],
  );

  const removeWe = removeWeId ? (weById.get(removeWeId) ?? null) : null;

  // §6.5 override hydration/persistence — per workout id, browser-session only
  const transitionStoreKey = workout ? `setforge:session:transition:${workout.id}` : null;
  useEffect(() => {
    if (!transitionStoreKey) return;
    try {
      const raw = window.localStorage.getItem(transitionStoreKey);
      if (raw != null) setSessionTransitionSec(JSON.parse(raw) as number | null);
    } catch {
      /* storage blocked */
    }
  }, [transitionStoreKey]);
  const setTransition = useCallback(
    (v: number | null) => {
      setSessionTransitionSec(v);
      if (transitionStoreKey) {
        try {
          window.localStorage.setItem(transitionStoreKey, JSON.stringify(v));
        } catch {
          /* storage blocked */
        }
      }
    },
    [transitionStoreKey],
  );

  // ---------- §6.1 session mode ----------
  const sessionMode = settings?.sessionMode ?? "AUTO";
  const sourceType = workout?.sourceType ?? "FREESTYLE";
  const guidedActive =
    !!workout &&
    !workout.finishedAt &&
    exercises.length > 0 &&
    (sessionMode === "GUIDED" || (sessionMode === "AUTO" && sourceType !== "FREESTYLE"));

  // ---------- §6.1 guided pointer (today-screen machinery, round-robin via
  // guidedPointerOrder — ungrouped sequential, then per-group round-robin) ----------
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

  /** §4.11 autoMoveNextSet — rest ended naturally: advance the pointer. */
  const handleRestComplete = useCallback(() => {
    if (!guidedActive || !settings?.autoMoveNextSet) return;
    setGuidedIdx((cur) => {
      if (cur >= pointerOrder.length) return cur;
      let i = cur;
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      return Math.min(i, pointerOrder.length);
    });
  }, [guidedActive, settings?.autoMoveNextSet, pointerOrder, isPointerComplete]);

  const rest = useRestState({ onComplete: handleRestComplete });
  const restActive = rest.remainingSec != null;
  const restLabel = restActive ? restLabelState : null;

  // ---------- §6.5 transition rest: pointer crossing a group boundary ----------
  /** After completing (weId, setId): the landing pointer entry when the
   *  completed set finishes its group AND later incomplete work exists in a
   *  DIFFERENT group — null otherwise. */
  const transitionAfter = useCallback(
    (weId: string, setId: string): { sec: number; label: string } | null => {
      if (!guidedActive || pointerOrder.length === 0) return null;
      const key = groupKeyOf(weId);
      const isDone = (p: { exerciseId: string; setIndex: number }) => {
        const s = sortedSetsByWe.get(p.exerciseId)?.[p.setIndex];
        if (p.exerciseId === weId && s?.id === setId) return true;
        return !!s?.isComplete;
      };
      let end = -1;
      pointerOrder.forEach((p, i) => {
        if (groupKeyOf(p.exerciseId) === key) end = i;
      });
      if (end < 0) return null;
      // the completed set's group must be fully logged (round-robin complete)
      for (let i = 0; i <= end; i++) {
        if (!isDone(pointerOrder[i])) return null;
      }
      // first incomplete pointer entry AFTER the group block = landing target
      for (let i = end + 1; i < pointerOrder.length; i++) {
        if (!isDone(pointerOrder[i])) {
          const nextWe = weById.get(pointerOrder[i].exerciseId);
          if (!nextWe) return null;
          const sec =
            sessionTransitionSec ??
            nextWe.exercise.transitionRestSec ??
            settings?.defaultTransitionRestSec ??
            0;
          return { sec, label: `Next: ${nextWe.exercise.name}` };
        }
      }
      return null; // last group — guided work is done, no transition
    },
    [
      guidedActive,
      pointerOrder,
      sortedSetsByWe,
      groupKeyOf,
      weById,
      sessionTransitionSec,
      settings?.defaultTransitionRestSec,
    ],
  );

  // ---------- session timer (elapsed title) ----------
  const startAtMs = workout?.startAt ? new Date(workout.startAt).getTime() : null;
  const endAtMs = workout?.endAt ? new Date(workout.endAt).getTime() : null;
  const timerRunning = startAtMs != null && endAtMs == null;
  useTicker(timerRunning);
  const elapsedSec =
    startAtMs != null ? Math.max(0, ((endAtMs ?? Date.now()) - startAtMs) / 1000) : null;

  const startTimer = async () => {
    if (!workout) return;
    const startAt = new Date().toISOString();
    await mutate({
      label: "Workout timer started",
      run: () => workoutsApi.update(workout.id, { startAt }),
      queue: { path: `/api/workouts/${workout.id}`, method: "PATCH", body: { startAt } },
    });
    toast.success("Timer started");
  };

  // ---------- set/exercise mutations (today-screen machinery) ----------
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
   *  (online) — false when queued offline or failed, so the guided pointer
   *  only advances on a logged set. Rest rules: §6.5 transition rest when the
   *  pointer crosses a group boundary; else the legacy autoRestFromRow rules. */
  const toggleSetDone = async (we: WorkoutExerciseDTO, set: SetDTO): Promise<boolean> => {
    if (!workout) return false;
    const next = !set.isComplete;
    if (next) hapticSuccess(); // §4.17 — set complete (row ✓ and Log set)
    const updated = await mutate({
      label: "Set updated",
      run: () => workoutsApi.updateSet(workout.id, we.id, set.id, { isComplete: next }),
      queue: {
        path: `/api/workouts/${workout.id}/exercises/${we.id}/sets/${set.id}`,
        method: "PATCH",
        body: { isComplete: next },
      },
    });
    if (updated && next && (set.setType ?? "NORMAL") !== "WARMUP" && !set.isWarmup) {
      // §6.5 — completing the last set of a group: transition rest + label
      const transition = transitionAfter(we.id, set.id);
      if (transition && transition.sec > 0) {
        setRestLabelState(transition.label);
        rest.start(transition.sec, set.id);
      } else if (settings?.autoRestFromRow ?? true) {
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

  /** §4.10d — fan a row's selected values onto every set of the exercise. */
  const applyToAll = async (we: WorkoutExerciseDTO, fields: ApplyToAllFields) => {
    const patch = cardPatchToSetInput(fields as Partial<CardSet>);
    for (const s of sortedSetsByWe.get(we.id) ?? []) {
      await patchSet(we, s.id, patch);
    }
    toast.success("Applied to every set");
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

  // ---------- Log set (§3.10 BottomBar primary) ----------
  /** Guided: complete the pointer set then advance (today-screen logic). */
  const logGuidedSet = async () => {
    const p = pointerOrder[guidedIdx];
    if (!p) return;
    const we = exercises.find((w) => w.id === p.exerciseId);
    const set = sortedSetsByWe.get(p.exerciseId)?.[p.setIndex];
    if (!we || !set || set.isComplete) return;
    const logged = await toggleSetDone(we, set);
    if (logged) advanceGuidedPast(guidedIdx + 1);
  };

  /** Free mode (§6.1): no pointer — the first incomplete set in day order. */
  const logFreeSet = async () => {
    for (const we of exercises) {
      const set = (sortedSetsByWe.get(we.id) ?? []).find((s) => !s.isComplete);
      if (set) {
        await toggleSetDone(we, set);
        return;
      }
    }
  };

  const logSet = () => {
    if (guidedActive) void logGuidedSet();
    else void logFreeSet();
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

  // ---------- §6.9 finish / discard ----------
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
      toast.success(`Session finished · ${nextLabel}`, {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => void undoFinish(workout.id),
        },
      });
      navigate("/workout");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish session");
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

  // ---------- derived ----------
  /** §4.11 sets progress (also the 32px progress row). */
  const setsProgress = useMemo(() => (workout ? setsProgressOf(workout) : null), [workout]);
  const setsPct =
    setsProgress && setsProgress.total > 0
      ? Math.min(100, Math.max(0, (setsProgress.completed / setsProgress.total) * 100))
      : 0;

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const guidedCardWeId = guidedIdx < pointerOrder.length ? pointerOrder[guidedIdx].exerciseId : null;
  const guidedAllDone = guidedActive && guidedIdx >= pointerOrder.length;
  const anyIncomplete = exercises.some((we) => we.sets.some((s) => !s.isComplete));
  const canLog = guidedActive
    ? guidedIdx < pointerOrder.length && !isPointerComplete(guidedIdx)
    : anyIncomplete;
  const allDone = guidedActive ? guidedAllDone : !anyIncomplete;

  /** Log-mode collapsed: exercises whose sets are ALL complete (§3.10 shows
   *  "3/3"); "Expand sets" (GroupCard) re-opens them via expandedIds. */
  const isCollapsed = useCallback(
    (we: WorkoutExerciseDTO): boolean =>
      we.sets.length > 0 && we.sets.every((s) => s.isComplete) && !expandedIds.has(we.id),
    [expandedIds],
  );
  const currentSetIndexFor = useCallback(
    (weId: string): number | undefined => {
      if (!guidedActive || guidedIdx >= pointerOrder.length) return undefined;
      const p = pointerOrder[guidedIdx];
      return p.exerciseId === weId ? p.setIndex : undefined;
    },
    [guidedActive, guidedIdx, pointerOrder],
  );

  /** The ⋮ menu's per-exercise actions (Group / Replace) target the CURRENT
   *  guided exercise — the first exercise in free mode. */
  const targetWeId = guidedCardWeId ?? exercises[0]?.id ?? null;
  const targetWe = targetWeId ? (weById.get(targetWeId) ?? null) : null;
  const targetReplaceHref = targetWeId ? `/exercises?replace=${targetWeId}&date=${dayKey}` : null;
  const arrangeHref =
    dayKey === today ? "/session/arrange" : `/session/arrange?date=${dayKey}`;
  const addExerciseHref = `/exercises?date=${dayKey}`;

  const defaultTransitionLabel = useMemo(() => {
    const nextWe =
      (guidedCardWeId ? weById.get(guidedCardWeId) : null) ?? exercises[0] ?? null;
    const sec =
      nextWe?.exercise.transitionRestSec ?? settings?.defaultTransitionRestSec ?? 0;
    return sec > 0 ? `${sec} s` : "off";
  }, [guidedCardWeId, weById, exercises, settings?.defaultTransitionRestSec]);

  // ---------- card actions ----------
  const handleCardAction =
    (we: WorkoutExerciseDTO) =>
    (action: CardAction): void => {
      switch (action.type) {
        case "toggle-collapse":
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.add(we.id);
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
        case "apply-to-all":
          void applyToAll(we, action.fields);
          break;
        case "notes":
          setNotesWeId(we.id);
          break;
        case "rest-timer":
          rest.start(we.exercise.restSec ?? undefined, action.setId ?? null);
          break;
        case "add-to-group":
          setGroupWeId(we.id);
          break;
        case "replace":
          navigate(`/exercises?replace=${we.id}&date=${dayKey}`);
          break;
        case "remove":
          setRemoveWeId(we.id);
          break;
        case "detail":
          navigate(`/exercise-overview/${we.exercise.id}`);
          break;
        case "history":
          navigate(`/session/exercise/${we.id}?date=${dayKey}&tab=history`);
          break;
        case "graph":
          navigate(`/session/exercise/${we.id}?date=${dayKey}&tab=graph`);
          break;
        case "records":
          navigate(`/exercise-overview/${we.exercise.id}?tab=records`);
          break;
        case "edit-sets":
        case "open":
          navigate(`/session/exercise/${we.id}?date=${dayKey}`);
          break;
        // ordering lives on #/session/arrange; preview/template-only actions
        // never fire from a log-mode card.
        case "move-up":
        case "move-down":
        case "select":
        case "toggle-select":
        case "remove-set":
        case "toggle-rpe-always":
        case "transition-rest":
          break;
      }
    };

  // ---------- render ----------
  const titleNode = !workout ? (
    "Logging"
  ) : elapsedSec != null ? (
    `${sessionName} · ${formatDuration(elapsedSec)}`
  ) : (
    <button
      type="button"
      {...tourAttrs({ id: "session.timerStart", label: "Start timer", help: "Start the session clock — the title counts up from then.", order: 140 })}
      onClick={() => void startTimer()}
      aria-label="Start the session timer"
      className="flex min-w-0 items-center gap-1 truncate text-left text-base font-semibold leading-none transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{sessionName}</span>
      <span className="flex-none text-xs font-bold uppercase tracking-wider text-muted-foreground">
        · start timer
      </span>
    </button>
  );

  return (
    <Screen
      nav={false}
      topBar={
        <TopBar
          leading={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-none"
                  aria-label="Close session"
                  tour={{ id: "session.close", label: "Close session", help: "Finish, discard, or keep logging — the session exit menu.", order: 10 }}
                >
                  <X className="h-5 w-5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  {...tourAttrs({ id: "session.finish", label: "Finish", help: "Save this session to your history and advance the program.", order: 20 })}
                  onClick={() => void finishWorkout()}
                >
                  <Flag className="h-4 w-4" aria-hidden /> Finish
                </DropdownMenuItem>
                <DropdownMenuItem
                  {...tourAttrs({ id: "session.discard", label: "Discard", help: "Remove this session and revert the program cursor and schedule.", order: 30 })}
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    hapticWarning();
                    setDiscardOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Discard
                </DropdownMenuItem>
                <DropdownMenuItem>Keep going</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          title={titleNode}
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 flex-none"
                    aria-label="Session actions"
                    tour={{ id: "session.menu", label: "Session menu", help: "Note, reorder, groups, replace, save as session, transition rest.", order: 40 }}
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setNoteOpen(true)}>
                    <MessageSquareText className="h-4 w-4" aria-hidden /> Note
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(arrangeHref)}>
                    <ArrowDownUp className="h-4 w-4" aria-hidden /> Reorder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!targetWe}
                    onClick={() => targetWeId && setGroupWeId(targetWeId)}
                  >
                    <Link2 className="h-4 w-4" aria-hidden />
                    Group{targetWe ? ` · ${targetWe.exercise.name}` : ""}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!targetWe}
                    onClick={() => targetReplaceHref && navigate(targetReplaceHref)}
                  >
                    <Replace className="h-4 w-4" aria-hidden />
                    Replace{targetWe ? ` ${targetWe.exercise.name}` : " exercise"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => sessionFromWorkout.openFor(workout!.id, dayKey)}>
                    <BookmarkPlus className="h-4 w-4" aria-hidden /> Save as session
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTransitionOpen(true)}>
                    <Timer className="h-4 w-4" aria-hidden /> Transition rest
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        workout && setsProgress ? (
          <div
            data-row
            {...tourAttrs({ id: "session.progress", label: "Sets progress", help: "Completed sets out of the session total — fills as you log.", order: 50 })}
            className="flex h-8 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-b border-border px-4"
          >
            <div
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Session sets progress"
              aria-valuemin={0}
              aria-valuemax={setsProgress.total}
              aria-valuenow={setsProgress.completed}
              aria-valuetext={`${setsProgress.completed} of ${setsProgress.total} sets done`}
            >
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${setsPct}%` }}
              />
            </div>
            <span className="flex-none text-xs font-semibold tabular-nums text-muted-foreground">
              {setsProgress.completed}/{setsProgress.total} sets
            </span>
          </div>
        ) : null
      }
      bottomBar={
        <BottomBar>
          {restActive ? (
            <RestBar
              display={formatDuration(rest.remainingSec ?? 0)}
              label={restLabel}
              onAdjust={rest.adjust}
              onSkip={rest.skip}
            />
          ) : workout?.finishedAt ? (
            // post-finish window (the gate redirects once the cache settles)
            <FinishedBar />
          ) : workout && exercises.length === 0 ? (
            <AddExerciseBar onAdd={() => navigate(addExerciseHref)} />
          ) : workout ? (
            <LogBar
              onAdd={() => navigate(addExerciseHref)}
              onLog={logSet}
              onFinish={() => void finishWorkout()}
              canLog={canLog}
              allDone={allDone}
            />
          ) : null}
        </BottomBar>
      }
    >
      <ScrollBody>
        {loading || !workout ? (
          <SessionSkeleton />
        ) : (
          <>
            {/* §4.11 RING rest display — FIRST child, pushes content down,
                removed when rest ends (RestBar stays in the BottomBar) */}
            {restActive && settings?.restDisplay === "RING" ? (
              <RestRingBlock
                remainingSec={rest.remainingSec ?? 0}
                totalSec={rest.totalSec}
                onAdjust={rest.adjust}
                onSkip={rest.skip}
              />
            ) : null}

            {groups.length > 0 ? (
              <GroupCardStack>
                {groups.map((g) => {
                  const wg = g.groupId ? groupById.get(g.groupId) : undefined;
                  const colour = wg?.colour ?? g.members[0]?.exercise.category?.colour;
                  return (
                    <div
                      key={g.key}
                      className="relative flex-none"
                      ref={(el) => {
                        for (const m of g.members) {
                          if (el) cardRefs.current.set(m.id, el);
                          else cardRefs.current.delete(m.id);
                        }
                      }}
                    >
                      <GroupCard
                        mode="log"
                        group={{ code: g.code, label: g.label, colour }}
                        entries={g.members.map((we, i) => ({
                          exercise: toCardExercise(we, settings),
                          sets: cardSetsOf(we),
                          code: memberCode(g.code, i),
                          tip: we.exercise.trainerTip ?? null,
                          note: noteByExerciseId.get(we.exerciseId) ?? null,
                          collapsed: isCollapsed(we),
                          currentSetIndex: currentSetIndexFor(we.id),
                        }))}
                        visibleColumns={visibleColumns}
                        onAction={(action, entryIndex) => {
                          const we = g.members[entryIndex];
                          if (we) handleCardAction(we)(action);
                        }}
                      />
                      {g.members.map((we) => (
                        <Fragment key={we.id}>
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
                        </Fragment>
                      ))}
                    </div>
                  );
                })}
              </GroupCardStack>
            ) : (
              <div
                role="status"
                className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card px-6 text-center"
              >
                <Dumbbell className="h-6 w-6 flex-none text-muted-foreground" aria-hidden />
                <p className="text-sm font-semibold">No exercises yet</p>
                <p className="text-xs text-muted-foreground">
                  Add an exercise to start logging this session.
                </p>
              </div>
            )}

            {/* anchor host for the ⋮-menu popovers (note / transition rest) */}
            <div className="relative flex-none" aria-hidden={false}>
              <NotePopover
                workout={workout}
                open={noteOpen}
                onClose={() => setNoteOpen(false)}
              />
              <TransitionRestPopover
                open={transitionOpen}
                onClose={() => setTransitionOpen(false)}
                value={sessionTransitionSec}
                onChange={(v) => {
                  setTransition(v);
                  toast.success(
                    v == null
                      ? "Transition rest follows your defaults"
                      : v === 0
                        ? "Transition rest off"
                        : `Transition rest ${v} s`,
                  );
                }}
                defaultLabel={defaultTransitionLabel}
              />
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

            {sessionFromWorkout.dialog}
          </>
        )}
      </ScrollBody>

      {/* §6.9 discard — destructive confirm (the only destructive surface) */}
      <DiscardConfirmDialog
        workout={workout}
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        dayKey={dayKey}
        onDiscarded={() => navigate("/workout")}
      />
    </Screen>
  );
}

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading session">
      <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}
