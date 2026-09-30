"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionScreen — #/session (Part 10 §3 live logging rebuild). Same logging
// engine as the Part 8 §3.10 screen (use-mutate + toggleSetDone + rest-state +
// §6.5 transition rest); the SURFACE is rebuilt per spec:
//
//   TopBar (56)  : ✕ → EndWorkoutDialog (§3.6) · centre "Total time {mm:ss}"
//                  mono (§3.2 — derived now − Workout.startAt, ticks 1/s;
//                  tap to start when unset) · ⚙ → #/session/settings (§3.5)
//   SubBar (48)  : segmented Overview | Logs | History (§3.3)
//   ScrollBody   : FocusCard (§3.1) sticky at the top — collapses to a 56px
//                  row past 80px of scroll, tap scrolls back — then the
//                  [RestRingBlock while resting · RING] and the tab body.
//   BottomBar(56): RestBar while resting · FinishedBar post-finish ·
//                  AddExerciseBar (no exercises) · LogBar `[+ Add exercise]
//                  [Log set ✓]` — all-done primary opens the §3.6 dialog.
//
// §3 focus pointer: ONE series-order pointer (A1 s1 → A2 s1 → A1 s2 … —
//   deriveGroups order; singletons sequential, groups round-robin) drives the
//   FocusCard, "Log set", the Overview 4px accent bar and auto-advance. The
//   focus identity (exercise + set index) survives exercise add/remove and
//   reloads via localStorage `sf-live-focus:{workoutId}` (§3.4; Dexie absent —
//   see plan deviations).
// §3.1 countdown: 3-2-1 short beeps + long tone at 0 via countdown-audio when
//   settings.countdownSounds and the tab is visible; the rest engine's own
//   end-beep is suppressed (this screen owns the soundscape).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Screen, TopBar, SubBar, ScrollBody, BottomBar, TopBarHelp } from "@/components/layout";
import { tourAttrs } from "@/lib/tour/attrs";
import type { TourDecl } from "@/lib/tour/types";
import { GroupCard, GroupCardStack, toCardSet } from "@/components/group-card";
import type {
  ApplyToAllFields,
  CardAction,
  CardExercise,
  CardSet,
  CardVisibleColumns,
  GroupMenuItem,
} from "@/components/group-card";
import { Button } from "@/components/ui/button";
import {
  ArrowDownUp,
  BookmarkPlus,
  Dumbbell,
  Link2,
  MessageSquareText,
  Replace,
  Settings as SettingsIcon,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/client/store";
import { dayApi, workoutsApi, type SetInput } from "@/lib/client/api";
import { hapticSuccess, hapticWarning } from "@/lib/client/haptics";
import { deriveGroups, memberCode } from "@/lib/grouping";
import { SET_TYPE_META, type SetType } from "@/lib/constants";
import { qk, useExerciseSessionHistory, useWorkoutByDate } from "@/lib/client/query";
import { dayKeyOf, todayKey, formatDayShort, round1, round2 } from "@/lib/client/format";
import { formatDuration } from "@/lib/formulas";
import { cn } from "@/lib/utils";
import { replaceHash } from "@/features/shell/router";
import { useSessionFromWorkout } from "@/features/routines/session-dialog";
import { exerciseUnit } from "@/features/exercises/labels";
import type {
  ExerciseHistoryEntryDTO,
  SetDTO,
  SettingsDTO,
  WorkoutDTO,
  WorkoutExerciseDTO,
} from "@/lib/types";
import { useMutate } from "./use-mutate";
import { useRestState } from "./rest-state";
import { AddExerciseBar, FinishedBar, LogBar, RestBar } from "./bars";
import { RestRingBlock } from "./rest-ring-block";
import { FocusCard, focusCardSet } from "./focus-card";
import { EndWorkoutDialog } from "./end-workout-dialog";
import { formatTotalTime } from "./time";
import {
  primeCountdownAudio,
  countdownTickBeep,
  countdownZeroTone,
} from "./countdown-audio";
import {
  ConfirmRemoveExercise,
  ExerciseGroupPopover,
  ExerciseNotesPopover,
} from "./card-popovers";
import { NotePopover, TransitionRestPopover } from "./screen-popovers";

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

/** 1 Hz re-render while the session timer runs (total-time title). */
function useTicker(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** §4.11 sets progress — non-warmup performed sets / total sets (§3.1 all-done
 *  FocusCard presentation). */
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

/**
 * §3 series-order pointer: every set of the day in the order the athlete
 * trains it — groups in day order; singletons sequential, group members
 * round-robin (A1 s1 → A2 s1 → A1 s2 …). ONE ordering for the FocusCard,
 * "Log set", Overview jumps and auto-advance.
 */
function seriesPointerOrder(
  exercises: Array<{ id: string; groupId: string | null; sortOrder: number; setCount: number }>,
): Array<{ exerciseId: string; setIndex: number }> {
  const out: Array<{ exerciseId: string; setIndex: number }> = [];
  for (const g of deriveGroups(exercises)) {
    if (g.size === 1) {
      const m = g.members[0];
      for (let s = 0; s < m.setCount; s++) out.push({ exerciseId: m.id, setIndex: s });
    } else {
      let round = 0;
      let remaining = g.members.reduce((n, m) => n + m.setCount, 0);
      while (remaining > 0) {
        for (const m of g.members) {
          if (round < m.setCount) {
            out.push({ exerciseId: m.id, setIndex: round });
            remaining -= 1;
          }
        }
        round += 1;
      }
    }
  }
  return out;
}

/** §3.3 Logs/History row value: "{reps}×{weight}{unit}" (cardio → km / time). */
function logValueText(s: SetDTO, unit: string | null): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(String(s.reps));
  if (s.weight != null) parts.push(`×${round1(s.weight)}${unit ?? ""}`);
  if (parts.length === 0 && s.distance != null) parts.push(`${round2(s.distance)} km`);
  if (parts.length === 0 && s.timeSec != null) parts.push(formatDuration(s.timeSec));
  return parts.length > 0 ? parts.join(" ") : "—";
}

const SESSION_TABS: Array<{ id: SessionTab; label: string; tour: TourDecl }> = [
  {
    id: "overview",
    label: "Overview",
    tour: { id: "session.tabOverview", label: "Overview tab", help: "The full day — every series, set and logged value.", order: 20 },
  },
  {
    id: "logs",
    label: "Logs",
    tour: { id: "session.tabLogs", label: "Logs tab", help: "Every set logged this session, oldest first.", order: 30 },
  },
  {
    id: "history",
    label: "History",
    tour: { id: "session.tabHistory", label: "History tab", help: "Your last five sessions of the focus exercise.", order: 40 },
  },
];

type SessionTab = "overview" | "logs" | "history";

export default function SessionScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings);
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

  // §5.4: the source day's DayOverride notes render on the FocusCard 📝 and
  // the GroupCard note row. Same cached chain the day overview uses (qk.day).
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
  const [activeTab, setActiveTab] = useState<SessionTab>("overview");
  /** §3.1: the sticky FocusCard collapses past 80px of scroll. */
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [notesWeId, setNotesWeId] = useState<string | null>(null);
  const [groupWeId, setGroupWeId] = useState<string | null>(null);
  const [removeWeId, setRemoveWeId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  /** §6.5 per-session transition rest override (null = exercise ?? settings),
   *  persisted in localStorage per workout id so it survives route hops. */
  const [sessionTransitionSec, setSessionTransitionSec] = useState<number | null>(null);
  /** RestBar label while a §6.5 transition rest runs ("Next: Barbell Curl"). */
  const [restLabelState, setRestLabelState] = useState<string | null>(null);
  /** §3 focus pointer — index into seriesPointerOrder (== length: all done). */
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

  // ---------- §3.1 FocusCard collapse-on-scroll + jump reveal ----------
  /** Scroll the (single) ScrollBody to the top — reveals the full FocusCard
   *  (collapsed-row tap §3.1, jump §3.4). */
  const scrollToFocus = useCallback(() => {
    const el = document.querySelector<HTMLElement>("[data-scroll-body]");
    if (!el) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);
  const handleBodyScroll = useCallback((scrollTop: number) => {
    if (scrollTop > 80) setFocusCollapsed(true);
    else if (scrollTop <= 8) setFocusCollapsed(false);
  }, []);

  // ---------- §3 series-order focus pointer ----------
  const sortedSetsByWe = useMemo(() => {
    const m = new Map<string, SetDTO[]>();
    for (const we of exercises) {
      m.set(we.id, [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder));
    }
    return m;
  }, [exercises]);

  const pointerOrder = useMemo(
    () =>
      exercises.length > 0
        ? seriesPointerOrder(
            exercises.map((we) => ({
              id: we.id,
              groupId: we.groupId,
              sortOrder: we.sortOrder,
              setCount: we.sets.length,
            })),
          )
        : [],
    [exercises],
  );

  const isPointerComplete = useCallback(
    (i: number): boolean => {
      const p = pointerOrder[i];
      if (!p) return false;
      return !!sortedSetsByWe.get(p.exerciseId)?.[p.setIndex]?.isComplete;
    },
    [pointerOrder, sortedSetsByWe],
  );

  /** Focus identity — survives pointerOrder recomputation (add/remove). */
  const lastFocusRef = useRef<{ exerciseId: string; setIndex: number } | null>(null);

  /** Explicit focus move (jump/advance) — updates identity synchronously. */
  const applyFocus = useCallback(
    (i: number) => {
      const p = pointerOrder[i];
      if (p) lastFocusRef.current = { exerciseId: p.exerciseId, setIndex: p.setIndex };
      setGuidedIdx(i);
    },
    [pointerOrder],
  );

  // keep the pointer valid: re-resolve the tracked identity when the order
  // changes under us, then skip past completed entries (external completion,
  // mount-restore onto a logged set). Explicit jumps target unlogged sets
  // (§3.4) so this never fights the user.
  useEffect(() => {
    if (pointerOrder.length === 0) return;
    setGuidedIdx((cur) => {
      const last = lastFocusRef.current;
      let i = cur;
      if (last) {
        const at = pointerOrder.findIndex(
          (p) => p.exerciseId === last.exerciseId && p.setIndex === last.setIndex,
        );
        if (at >= 0) i = at;
      }
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      return Math.min(i, pointerOrder.length);
    });
  }, [pointerOrder, isPointerComplete]);

  // passive identity sync (covers snaps made by the effect itself)
  useEffect(() => {
    const p = pointerOrder[guidedIdx];
    if (p) lastFocusRef.current = { exerciseId: p.exerciseId, setIndex: p.setIndex };
  }, [guidedIdx, pointerOrder]);

  /** §3.4 focus persistence — localStorage per workoutId ({groupIdx, memberIdx,
   *  setIdx}); restored on mount, written on every focus move. */
  const focusStoreKey = workout ? `sf-live-focus:${workout.id}` : null;
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusStoreKey || restoredForRef.current === focusStoreKey) return;
    if (pointerOrder.length === 0) return;
    restoredForRef.current = focusStoreKey;
    let entry: { exerciseId: string; setIndex: number } | null = null;
    try {
      const raw = window.localStorage.getItem(focusStoreKey);
      if (raw) {
        const saved = JSON.parse(raw) as { groupIdx: number; memberIdx: number; setIdx: number };
        const we = groups[saved.groupIdx]?.members[saved.memberIdx];
        if (we) entry = { exerciseId: we.id, setIndex: saved.setIdx };
      }
    } catch {
      /* storage blocked */
    }
    if (!entry) return;
    const at = pointerOrder.findIndex(
      (p) => p.exerciseId === entry.exerciseId && p.setIndex === entry.setIndex,
    );
    if (at >= 0) applyFocus(at);
  }, [focusStoreKey, pointerOrder, groups, applyFocus]);

  useEffect(() => {
    if (!focusStoreKey) return;
    const p = pointerOrder[guidedIdx];
    if (!p) return;
    const groupIdx = groups.findIndex((g) => g.members.some((m) => m.id === p.exerciseId));
    if (groupIdx < 0) return;
    const memberIdx = groups[groupIdx].members.findIndex((m) => m.id === p.exerciseId);
    try {
      window.localStorage.setItem(
        focusStoreKey,
        JSON.stringify({ groupIdx, memberIdx, setIdx: p.setIndex }),
      );
    } catch {
      /* storage blocked */
    }
  }, [focusStoreKey, guidedIdx, pointerOrder, groups]);

  /** §3.4 jump — tap an unlogged set row (Overview table): focus = that set. */
  const jumpToSet = useCallback(
    (weId: string, setIdx: number) => {
      const at = pointerOrder.findIndex((p) => p.exerciseId === weId && p.setIndex === setIdx);
      if (at < 0 || isPointerComplete(at)) return; // logged rows are history
      applyFocus(at);
      scrollToFocus();
    },
    [pointerOrder, isPointerComplete, applyFocus, scrollToFocus],
  );

  /** §3.4 jump — tap an exercise header: focus = its first unlogged set. */
  const jumpToExercise = useCallback(
    (weId: string) => {
      for (let i = 0; i < pointerOrder.length; i++) {
        const p = pointerOrder[i];
        if (p.exerciseId === weId && !isPointerComplete(i)) {
          applyFocus(i);
          scrollToFocus();
          return;
        }
      }
    },
    [pointerOrder, isPointerComplete, applyFocus, scrollToFocus],
  );

  // ---------- rest engine (§4.11/§6.5; this screen owns countdown sounds) ----------
  const countdownSoundsOn = settings?.countdownSounds ?? false;

  /** §4.11/§3.1 autoMoveNextSet — rest ended naturally: advance the pointer
   *  (and sound the long zero tone when countdown sounds are on). */
  const handleRestComplete = useCallback(() => {
    if (countdownSoundsOn) countdownZeroTone();
    if (!(settings?.autoMoveNextSet ?? true)) return;
    setGuidedIdx((cur) => {
      const last = lastFocusRef.current;
      let i = cur;
      if (last) {
        const at = pointerOrder.findIndex(
          (p) => p.exerciseId === last.exerciseId && p.setIndex === last.setIndex,
        );
        if (at >= 0) i = at;
      }
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      return Math.min(i, pointerOrder.length);
    });
  }, [countdownSoundsOn, settings?.autoMoveNextSet, pointerOrder, isPointerComplete]);

  const rest = useRestState({ onComplete: handleRestComplete, sounds: false });
  const restActive = rest.remainingSec != null;
  const restLabel = restActive ? restLabelState : null;

  // §3.1 countdown ticks — short beeps at 3/2/1s remaining (visible tab only;
  // countdown-audio no-ops while hidden).
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!restActive || !countdownSoundsOn) {
      lastTickRef.current = null;
      return;
    }
    const sec = rest.remainingSec;
    if (sec == null || sec <= 0) return;
    if (sec <= 3 && lastTickRef.current !== sec) {
      lastTickRef.current = sec;
      countdownTickBeep();
    }
  }, [restActive, rest.remainingSec, countdownSoundsOn]);

  // ---------- §6.5 transition rest: focus crossing a group boundary ----------
  /** After completing (weId, setId): the landing pointer entry when the
   *  completed set finishes its group AND later incomplete work exists in a
   *  DIFFERENT group — null otherwise. */
  const transitionAfter = useCallback(
    (weId: string, setId: string): { sec: number; label: string } | null => {
      if (pointerOrder.length === 0) return null;
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
      return null; // last group — all guided work done, no transition
    },
    [
      pointerOrder,
      sortedSetsByWe,
      groupKeyOf,
      weById,
      sessionTransitionSec,
      settings?.defaultTransitionRestSec,
    ],
  );

  // ---------- session timer (§3.2 total time — now − startAt) ----------
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

  // ---------- set/exercise mutations (the §3.10 engine) ----------
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
   *  (online) — false when queued offline or failed, so the focus pointer
   *  only advances on a logged set. Rest rules: §6.5 transition rest when the
   *  focus crosses a group boundary; else the legacy autoRestFromRow rules. */
  const toggleSetDone = async (we: WorkoutExerciseDTO, set: SetDTO): Promise<boolean> => {
    if (!workout) return false;
    const next = !set.isComplete;
    if (next) {
      hapticSuccess(); // §4.17 — set complete (row ✓ and Log set)
      primeCountdownAudio(); // §3.1 — the AudioContext needs a user gesture
    }
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
      } else {
        setRestLabelState(null); // normal rest — clear any stale Next: label
        if (settings?.autoRestFromRow ?? true) {
          const restSec = set.restPlannedSec ?? we.exercise.restSec ?? null;
          if (restSec && restSec > 0) rest.start(restSec, set.id);
          else if (rest.everStarted) rest.start(undefined, set.id);
        } else if (rest.everStarted) {
          rest.start(undefined, set.id);
        }
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

  // ---------- Log set (§3 BottomBar primary — completes the focus set) ----------
  const logFocusSet = async () => {
    const p = pointerOrder[guidedIdx];
    if (!p) return;
    const we = weById.get(p.exerciseId);
    const set = sortedSetsByWe.get(p.exerciseId)?.[p.setIndex];
    if (!we || !set || set.isComplete) return;
    const logged = await toggleSetDone(we, set);
    if (logged) {
      let i = guidedIdx + 1;
      while (i < pointerOrder.length && isPointerComplete(i)) i += 1;
      applyFocus(Math.min(i, pointerOrder.length));
    }
  };

  // ---------- derived ----------
  const setsProgress = useMemo(() => (workout ? setsProgressOf(workout) : null), [workout]);

  const visibleColumns: CardVisibleColumns = {
    setType: settings?.showSetType ?? true,
    rpe: settings?.showRpe ?? true,
    tempo: settings?.showTempo ?? true,
    rest: settings?.showRest ?? true,
  };

  const focusEntry = guidedIdx < pointerOrder.length ? pointerOrder[guidedIdx] : null;
  const focusWe = focusEntry ? (weById.get(focusEntry.exerciseId) ?? null) : null;
  const focusSet = focusEntry
    ? (sortedSetsByWe.get(focusEntry.exerciseId)?.[focusEntry.setIndex] ?? null)
    : null;
  const focusGroupIdx = focusEntry
    ? groups.findIndex((g) => g.members.some((m) => m.id === focusEntry.exerciseId))
    : -1;
  const focusGroup = focusGroupIdx >= 0 ? groups[focusGroupIdx] : null;
  const focusMemberIdx =
    focusGroup && focusEntry
      ? focusGroup.members.findIndex((m) => m.id === focusEntry.exerciseId)
      : -1;
  const focusCode =
    focusGroup && focusMemberIdx >= 0 ? memberCode(focusGroup.code, focusMemberIdx) : "—";
  const focusSeriesLabel = focusGroup ? focusGroup.label || "Single" : "Single";
  const focusCardExercise = focusWe ? toCardExercise(focusWe, settings) : null;

  const canLog = guidedIdx < pointerOrder.length && !isPointerComplete(guidedIdx);
  const allDone = exercises.length > 0 && guidedIdx >= pointerOrder.length;

  /** Log-mode collapsed: exercises whose sets are ALL complete (§3.10 shows
   *  "3/3"); "Expand sets" (GroupCard) re-opens them via expandedIds. */
  const isCollapsed = useCallback(
    (we: WorkoutExerciseDTO): boolean =>
      we.sets.length > 0 && we.sets.every((s) => s.isComplete) && !expandedIds.has(we.id),
    [expandedIds],
  );
  const currentSetIndexFor = useCallback(
    (weId: string): number | undefined => {
      if (!focusEntry) return undefined;
      return focusEntry.exerciseId === weId ? focusEntry.setIndex : undefined;
    },
    [focusEntry],
  );

  const arrangeHref = dayKey === today ? "/session/arrange" : `/session/arrange?date=${dayKey}`;
  const addExerciseHref = `/exercises?date=${dayKey}`;
  const focusReplaceHref = focusWe ? `/exercises?replace=${focusWe.id}&date=${dayKey}` : null;

  const defaultTransitionLabel = useMemo(() => {
    const nextWe = focusWe ?? exercises[0] ?? null;
    const sec =
      nextWe?.exercise.transitionRestSec ?? settings?.defaultTransitionRestSec ?? 0;
    return sec > 0 ? `${sec} s` : "off";
  }, [focusWe, exercises, settings?.defaultTransitionRestSec]);

  /** §3.1 R2 … — the live ⋮ menu (the old TopBar ⋮, moved onto the card). */
  const focusMenuItems: GroupMenuItem[] = [
    { icon: MessageSquareText, label: "Note", action: { type: "notes" } },
    { icon: ArrowDownUp, label: "Reorder", action: { type: "reorder" } },
    { icon: Link2, label: "Group", action: { type: "add-to-group" } },
    { icon: Replace, label: "Replace", action: { type: "replace" } },
    { icon: BookmarkPlus, label: "Save as session", action: { type: "save-session" } },
    { icon: Timer, label: "Transition rest", action: { type: "transition-rest", exerciseId: "", sec: 0 } },
  ];

  const handleFocusMenuAction = useCallback(
    (action: CardAction): void => {
      switch (action.type) {
        case "notes":
          setNoteOpen(true);
          break;
        case "reorder":
          navigate(arrangeHref);
          break;
        case "add-to-group":
          if (focusWe) setGroupWeId(focusWe.id);
          break;
        case "replace":
          if (focusReplaceHref) navigate(focusReplaceHref);
          break;
        case "save-session":
          if (workout) sessionFromWorkout.openFor(workout.id, dayKey);
          break;
        case "transition-rest":
          setTransitionOpen(true);
          break;
        default:
          break;
      }
    },
    [navigate, arrangeHref, focusWe, focusReplaceHref, workout, dayKey, sessionFromWorkout],
  );

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
        // ordering lives on #/session/arrange (the FocusCard … menu handles
        // it); preview/template-only actions never fire from a log-mode card.
        case "move-up":
        case "move-down":
        case "select":
        case "toggle-select":
        case "remove-set":
        case "toggle-rpe-always":
        case "transition-rest":
        case "rearrange-series":
        case "add-to-series":
        case "remove-series":
        case "reorder":
        case "save-session":
          break;
      }
    };

  // ---------- §3.3 Logs tab rows ----------
  /** Series code per exercise (A1, B2 …) for the flat log rows. */
  const codeByWeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) g.members.forEach((we, i) => m.set(we.id, memberCode(g.code, i)));
    return m;
  }, [groups]);

  const logRows = useMemo(() => {
    if (!workout) return [];
    interface LogRow {
      key: string;
      at: number;
      time: string;
      code: string;
      name: string;
      value: string;
      typeLabel: string | null;
    }
    const rows: LogRow[] = [];
    for (const we of exercises) {
      const unit = exerciseUnit(we.exercise, settings);
      const code = codeByWeId.get(we.id) ?? "—";
      for (const s of we.sets) {
        if (!s.isComplete || !s.completedAt) continue;
        const at = new Date(s.completedAt).getTime();
        rows.push({
          key: s.id,
          at,
          time: new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
          code,
          name: we.exercise.name,
          value: logValueText(s, unit),
          typeLabel: s.setType ? (SET_TYPE_META[s.setType as SetType]?.label ?? null) : null,
        });
      }
    }
    rows.sort((a, b) => a.at - b.at);
    return rows;
  }, [workout, exercises, codeByWeId, settings]);

  // ---------- §3.3 History tab (focus exercise, lazy on tab open) ----------
  const historyQuery = useExerciseSessionHistory(
    activeTab === "history" ? (focusWe?.exerciseId ?? null) : null,
    5,
  );

  // ---------- render ----------
  const titleNode = !workout ? (
    "Logging"
  ) : elapsedSec != null ? (
    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="flex-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Total time
      </span>
      <span className="flex-none font-mono text-base font-bold leading-none tabular-nums">
        {formatTotalTime(elapsedSec)}
      </span>
    </span>
  ) : (
    <button
      type="button"
      {...tourAttrs({ id: "session.timerStart", label: "Start timer", help: "Start the session clock — total time counts up from then.", order: 140 })}
      onClick={() => void startTimer()}
      aria-label="Start the session timer"
      className="flex min-w-0 items-center gap-1.5 truncate text-left leading-none transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Total time
      </span>
      <span className="flex-none text-xs font-bold uppercase tracking-wider text-primary">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-none"
              aria-label="End workout"
              tour={{ id: "session.close", label: "End workout", help: "End, save or discard this session — logged sets are never lost.", order: 10 }}
              onClick={() => {
                hapticWarning();
                setEndOpen(true);
              }}
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          }
          title={titleNode}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-none"
                aria-label="Session settings"
                tour={{ id: "session.settings", label: "Session settings", help: "Auto-advance, countdown sounds, tempo row and video speed.", order: 20 }}
                onClick={() => navigate("/session/settings")}
              >
                <SettingsIcon className="h-5 w-5" aria-hidden />
              </Button>
              <TopBarHelp />
            </>
          }
        />
      }
      subBar={
        <SubBar>
          {/* Equal-thirds segmented control — border-frame pattern (records-tab). */}
          <div
            data-row
            role="tablist"
            aria-label="Session view"
            className="grid h-10 w-full grid-cols-3 overflow-hidden whitespace-nowrap rounded-lg border bg-card"
          >
            {SESSION_TABS.map((t) => {
              const selected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  {...tourAttrs(t.tour)}
                  className={cn(
                    "flex h-full min-w-0 items-center justify-center overflow-hidden text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </SubBar>
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
              onLog={() => {
                primeCountdownAudio(); // §3.1 — the gesture primes countdown audio
                void logFocusSet();
              }}
              onFinish={() => {
                hapticWarning();
                setEndOpen(true);
              }}
              canLog={canLog}
              allDone={allDone}
            />
          ) : null}
        </BottomBar>
      }
    >
      <ScrollBody onScroll={handleBodyScroll}>
        {loading || !workout ? (
          <SessionSkeleton />
        ) : (
          <>
            {/* §3.1 FocusCard — sticky top of the ScrollBody (collapses >80px) */}
            {exercises.length > 0 ? (
              <div className="sticky top-0 z-10 bg-background">
                <FocusCard
                  we={focusWe}
                  set={focusSet}
                  code={focusCode}
                  seriesLabel={focusSeriesLabel}
                  note={focusWe ? (noteByExerciseId.get(focusWe.exerciseId) ?? null) : null}
                  cardExercise={focusCardExercise}
                  cardSet={focusEntry && focusSet ? focusCardSet(focusSet, focusEntry.setIndex + 1) : null}
                  sessionTotals={
                    setsProgress ? { done: setsProgress.completed, total: setsProgress.total } : null
                  }
                  collapsed={focusCollapsed}
                  onExpand={scrollToFocus}
                  settings={settings}
                  visibleColumns={visibleColumns}
                  onAction={focusWe ? handleCardAction(focusWe) : () => undefined}
                  menuItems={focusMenuItems}
                  onMenuAction={handleFocusMenuAction}
                />
              </div>
            ) : null}

            {/* §4.11 RING rest display — pushes content down, removed when
                rest ends (RestBar stays in the BottomBar) */}
            {restActive && settings?.restDisplay === "RING" ? (
              <RestRingBlock
                remainingSec={rest.remainingSec ?? 0}
                totalSec={rest.totalSec}
                onAdjust={rest.adjust}
                onSkip={rest.skip}
              />
            ) : null}

            {/* ---- §3.3 tab body ---- */}
            {activeTab === "overview" ? (
              groups.length > 0 ? (
                <GroupCardStack>
                  {groups.map((g) => {
                    const wg = g.groupId ? groupById.get(g.groupId) : undefined;
                    const colour = wg?.colour ?? g.members[0]?.exercise.category?.colour;
                    return (
                      <div key={g.key} className="relative flex-none">
                        <GroupCard
                          mode="log"
                          group={{ code: g.code, label: g.label, colour }}
                          overview={{
                            focusSetId: focusSet?.id ?? null,
                            onJumpSet: (setId) => {
                              for (const we of g.members) {
                                const idx = (sortedSetsByWe.get(we.id) ?? []).findIndex(
                                  (s) => s.id === setId,
                                );
                                if (idx >= 0) {
                                  jumpToSet(we.id, idx);
                                  return;
                                }
                              }
                            },
                            onJumpEntry: (entryIndex) => {
                              const we = g.members[entryIndex];
                              if (we) jumpToExercise(we.id);
                            },
                          }}
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
              )
            ) : activeTab === "logs" ? (
              <LogsPanel rows={logRows} />
            ) : (
              <HistoryPanel
                query={historyQuery}
                unit={focusWe ? exerciseUnit(focusWe.exercise, settings) : null}
              />
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

            {/* §3.6 — the single exit flow (✕ and the all-done primary) */}
            <EndWorkoutDialog
              workout={workout}
              elapsedSec={elapsedSec}
              open={endOpen}
              onClose={() => setEndOpen(false)}
              onEnded={() => navigate("/workout")}
            />
          </>
        )}
      </ScrollBody>
    </Screen>
  );
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

/** §3.3 Logs tab — flat chronological list of this session's completed sets. */
function LogsPanel({
  rows,
}: {
  rows: Array<{
    key: string;
    time: string;
    code: string;
    name: string;
    value: string;
    typeLabel: string | null;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <div
        role="status"
        className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card px-6 text-center"
      >
        <p className="text-sm font-semibold">Nothing logged yet.</p>
        <p className="text-xs text-muted-foreground">Sets appear here the moment you log them.</p>
      </div>
    );
  }
  return (
    <ol className="overflow-hidden rounded-lg border bg-card" aria-label="Logged sets">
      {rows.map((r) => (
        <li
          key={r.key}
          data-row
          className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border/60 px-3 text-xs last:border-b-0"
        >
          <span className="flex-none font-mono tabular-nums leading-none text-muted-foreground">
            {r.time}
          </span>
          <span className="flex-none font-bold tabular-nums leading-none text-muted-foreground">
            {r.code}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold leading-none">{r.name}</span>
          <span className="flex-none font-bold tabular-nums leading-none">{r.value}</span>
          {r.typeLabel ? (
            <span className="flex-none leading-none text-muted-foreground">{r.typeLabel}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** §3.3 History tab — the focus exercise's last 5 finished sessions. */
function HistoryPanel({
  query,
  unit,
}: {
  query: ReturnType<typeof useExerciseSessionHistory>;
  unit: string | null;
}) {
  if (query.isPending || query.isFetching) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading history">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }
  const sessions = query.data ?? [];
  if (sessions.length === 0) {
    return (
      <div
        role="status"
        className="flex h-[200px] w-full flex-none flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card px-6 text-center"
      >
        <p className="text-sm font-semibold">First time doing this exercise.</p>
        <p className="text-xs text-muted-foreground">History fills in as you train it.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s: ExerciseHistoryEntryDTO) => (
        <section
          key={`${s.workoutId}:${s.workoutExerciseId}`}
          className="overflow-hidden rounded-lg border bg-card"
          aria-label={`Session ${formatDayShort(dayKeyOf(s.date))}`}
        >
          <header
            data-row
            className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b px-3"
          >
            <span className="flex-none text-xs font-bold leading-none">
              {formatDayShort(dayKeyOf(s.date))}
            </span>
            {s.sourceLabel ? (
              <span className="min-w-0 flex-1 truncate text-xs leading-none text-muted-foreground">
                · {s.sourceLabel}
              </span>
            ) : null}
          </header>
          {s.sets.map((set, i) => (
            <div
              key={set.id}
              data-row
              className="flex h-8 items-center gap-2 overflow-hidden whitespace-nowrap px-3 text-xs tabular-nums"
            >
              <span className="flex-none leading-none text-muted-foreground">Set {i + 1}</span>
              <span className="ml-auto flex-none font-semibold leading-none">
                {logValueText(set, unit)}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
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
