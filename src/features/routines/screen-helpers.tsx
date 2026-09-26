"use client";

// ─────────────────────────────────────────────────────────────────────────────
// screen-helpers.ts — shared plumbing for the Part 3 routines screens
// (routines-screen / routine-detail-screen / log-day-screen /
// predefined-editor-screen). Self-contained on purpose: nothing imports the
// legacy src/features/routines/* files (they die in p3-9).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { queueMutation } from "@/lib/client/offline";
import { useInvalidate, useOnline } from "@/lib/client/query";
import { routinesApi, exercisesApi, type PredefinedSetInput } from "@/lib/client/api";
import { exerciseUnit } from "@/features/exercises/labels";
import type { CardExercise, CardSet } from "@/components/exercise-card/exercise-card";
import type { RoutineDayDTO, RoutineDTO, RoutineExerciseDTO, SettingsDTO } from "@/lib/types";

// ---------- meta formatting ----------

/** Compact "2d ago" / "5h ago" / "today" label for the routine list meta line. */
export function usedAgo(iso: string | null | undefined): string {
  if (!iso) return "never used";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "today";
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (hours < 1) return "used today";
  if (days < 1) return `used ${hours}h ago`;
  if (days === 1) return "used 1d ago";
  if (days < 30) return `used ${days}d ago`;
  if (days < 365) return `used ${Math.floor(days / 30)}mo ago`;
  return `used ${Math.floor(days / 365)}y ago`;
}

/** Most recent lastPerformed across every exercise of a routine (approximates "last trained"). */
export function routineUsedIso(
  routine: RoutineDTO,
  lastPerformedById: Map<string, string | null | undefined>,
): string | null {
  let best: string | null = null;
  for (const day of routine.days) {
    for (const re of day.exercises) {
      const iso = lastPerformedById.get(re.exerciseId);
      if (iso && (best == null || iso > best)) best = iso;
    }
  }
  return best;
}

/** `3 days · 12 exercises · used 2d ago` — the RoutineRow second line. */
export function routineMetaLine(
  routine: RoutineDTO,
  lastPerformedById: Map<string, string | null | undefined>,
): string {
  const dayCount = routine.days.length;
  const exCount = routine.days.reduce((n, d) => n + d.exercises.length, 0);
  return `${dayCount} ${dayCount === 1 ? "day" : "days"} · ${exCount} ${exCount === 1 ? "exercise" : "exercises"} · ${usedAgo(
    routineUsedIso(routine, lastPerformedById),
  )}`;
}

/** Legacy default day name: Day A, Day B, … Day Z, then Day 27. */
export function nextDayName(days: RoutineDayDTO[]): string {
  const n = days.length;
  const letter = String.fromCharCode(65 + (n % 26));
  return n < 26 ? `Day ${letter}` : `Day ${n + 1}`;
}

// ---------- card mapping ----------

export type AppSettings = SettingsDTO | null | undefined;

export function toCardExercise(re: RoutineExerciseDTO, settings: AppSettings): CardExercise {
  return {
    id: re.id,
    name: re.exercise.name,
    categoryLabel: re.exercise.category?.name ?? "Exercise",
    categoryColour: re.exercise.category?.colour ?? "#71717a",
    modality: re.exercise.type,
    unit: exerciseUnit(re.exercise, settings),
    weightIncrement: re.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5,
  };
}

/** Sorted CardSets from a routine exercise's predefined sets. */
export function cardSetsOf(re: RoutineExerciseDTO): CardSet[] {
  return [...re.sets]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => {
      const base = {
        id: s.id,
        index: i + 1,
        setType: s.setType ?? null,
        weightKg: s.weight ?? null,
        reps: s.reps ?? null,
        distanceM: s.distance ?? null,
        timeSec: s.timeSec ?? null,
        rpe: s.rpe ?? null,
        tempo: s.tempo ?? null,
        restPlannedSec: s.restPlannedSec ?? null,
        restActualSec: null,
        done: false,
        selected: false,
        isNewPr: false,
        note: null,
      } satisfies CardSet;
      return base;
    });
}

/** Map a CardSet patch (SetRow/ExerciseCard contract) onto PredefinedSetInput.
 *  `note` is dropped — predefined sets carry no comment field. */
export function cardPatchToPredefinedInput(patch: Partial<CardSet>): PredefinedSetInput {
  const out: PredefinedSetInput = {};
  if ("weightKg" in patch) out.weight = patch.weightKg ?? null;
  if ("reps" in patch) out.reps = patch.reps ?? null;
  if ("distanceM" in patch) out.distance = patch.distanceM ?? null;
  if ("timeSec" in patch) out.timeSec = patch.timeSec ?? null;
  if ("rpe" in patch) out.rpe = patch.rpe ?? null;
  if ("tempo" in patch) out.tempo = patch.tempo ?? null;
  if ("restPlannedSec" in patch) out.restPlannedSec = patch.restPlannedSec ?? null;
  if ("setType" in patch) out.setType = patch.setType ?? null;
  return out;
}

// ---------- drag handle (present, not wired — reorder via ⋮ Move up/down) ----------

/** 24px muted grip glyph. DnD is not wired in this build: reordering works via
 *  the ⋮ menus (functional parity; documented deviation). */
export function DragGlyph(): ReactNode {
  return (
    <span
      aria-hidden
      title="Reorder via the ⋮ menu"
      className="flex h-6 w-6 flex-none items-center justify-center text-muted-foreground/40"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

// ---------- inline rename input (input-in-place, Enter saves / Esc cancels) ----------

export function InlineInput({
  value,
  onCommit,
  onCancel,
  ariaLabel,
  placeholder,
  autoFocus = true,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  ariaLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Input
      autoFocus={autoFocus}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={() => onCommit(draft.trim())}
      className={className ?? "h-11 min-w-0 flex-1"}
    />
  );
}

// ---------- offline-aware routine mutations (own copy; legacy dies in p3-9) ----------

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Something went wrong";
}

export type QueueDescriptor = {
  path: string;
  method: string;
  body?: unknown;
  label: string;
};

/** Like the legacy useRoutineMutations.run: online → execute + invalidate;
 *  offline → queue in the outbox. Returns true when reflected on the server. */
export function useRoutineRun() {
  const online = useOnline();
  const invalidate = useInvalidate();

  const run = useCallback(
    async (fn: () => Promise<unknown>, queue: QueueDescriptor): Promise<boolean> => {
      if (!online) {
        queueMutation(queue.path, queue.method, queue.body, queue.label);
        toast.info(`${queue.label} — saved offline, will sync when reconnected`);
        return false;
      }
      try {
        await fn();
        invalidate.routines();
        return true;
      } catch (e) {
        toast.error(errorMessage(e));
        return false;
      }
    },
    [online, invalidate],
  );

  return { online, run, invalidate };
}

// ---------- copy-last prefill (template screens) ----------

export type LastSet = {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
  setType?: string | null;
};

/**
 * Prefill values for a template set from the exercise's last workout.
 * Cached per exerciseId for the screen's lifetime. Same-index set is used,
 * falling back to the workout's final set when history is shorter.
 */
export function useLastSetsPrefill() {
  const cache = useRef<Map<string, LastSet[] | null>>(new Map());

  const prefillFor = useCallback(async (exerciseId: string, index0: number): Promise<LastSet | null> => {
    let sets = cache.current.get(exerciseId);
    if (sets === undefined) {
      try {
        const res = await exercisesApi.lastSets(exerciseId);
        sets = res.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          distance: s.distance,
          timeSec: s.timeSec,
          setType: s.setType ?? null,
        }));
      } catch {
        sets = null;
      }
      cache.current.set(exerciseId, sets);
    }
    if (!sets || sets.length === 0) return null;
    return sets[index0] ?? sets[sets.length - 1] ?? null;
  }, []);

  return prefillFor;
}

// ---------- routine reorder helpers ----------

/** Swap sortOrder of adjacent routines (i, i+1) — persists both positions. */
export function useRoutineReorder() {
  const { run } = useRoutineRun();
  return useCallback(
    async (routines: RoutineDTO[], index: number, delta: -1 | 1) => {
      const j = index + delta;
      if (j < 0 || j >= routines.length) return;
      const next = [...routines];
      [next[index], next[j]] = [next[j], next[index]];
      const ops = next.map((r, i) => ({
        id: r.id,
        sortOrder: i,
        prev: r.sortOrder,
      }));
      for (const op of ops) {
        if (op.sortOrder === op.prev) continue;
        await run(
          () => routinesApi.update(op.id, { sortOrder: op.sortOrder }),
          {
            path: `/api/routines/${op.id}`,
            method: "PATCH",
            body: { sortOrder: op.sortOrder },
            label: "Routine order",
          },
        );
      }
    },
    [run],
  );
}

/** Swap adjacent days inside one routine (persists the changed sortOrders). */
export function useDayReorder(routineId: string) {
  const { run } = useRoutineRun();
  return useCallback(
    async (days: RoutineDayDTO[], index: number, delta: -1 | 1) => {
      const j = index + delta;
      if (j < 0 || j >= days.length) return;
      const next = [...days];
      [next[index], next[j]] = [next[j], next[index]];
      for (let i = 0; i < next.length; i++) {
        if (next[i].sortOrder === i) continue;
        const dayId = next[i].id;
        await run(
          () => routinesApi.updateDay(routineId, dayId, { sortOrder: i }),
          {
            path: `/api/routines/${routineId}/days/${dayId}`,
            method: "PATCH",
            body: { sortOrder: i },
            label: "Day order",
          },
        );
      }
    },
    [run, routineId],
  );
}

/** Reorder routine exercises within a day (PUT the new id order). */
export function useExerciseReorder(routineId: string, dayId: string) {
  const { run } = useRoutineRun();
  return useCallback(
    async (reIds: string[], reId: string, delta: -1 | 1) => {
      const i = reIds.indexOf(reId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= reIds.length) return;
      const next = [...reIds];
      [next[i], next[j]] = [next[j], next[i]];
      await run(
        () => routinesApi.reorderExercises(routineId, dayId, next),
        {
          path: `/api/routines/${routineId}/days/${dayId}/exercises/order`,
          method: "PUT",
          body: { ids: next },
          label: "Exercise order",
        },
      );
    },
    [run, routineId, dayId],
  );
}
