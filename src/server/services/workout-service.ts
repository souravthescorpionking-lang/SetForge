// Workout domain service — day view, exercises, sets, groups, copy, move, reorder.
// Every method takes userId first; every query is user-scoped; PRs recompute in the same transaction.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { toDayUtc, addDays, todayDayUtc } from "@/lib/dates";
import { mapWorkout, mapSet, mapGroup, mapWorkoutSummary } from "../mappers";
import { badRequest, notFound } from "../http";
import type { Prisma } from "@prisma/client";

export const workoutInclude = {
  exercises: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      exercise: { include: { category: true } },
      sets: { orderBy: { sortOrder: "asc" as const } },
    },
  },
  groups: true,
  // ---- Part 9 §8: sourceLabel derivation for legacy rows ----
  sourceRoutine: { select: { name: true } },
  sourceDay: { select: { name: true } },
} satisfies Prisma.WorkoutInclude;

type WorkoutFull = Prisma.WorkoutGetPayload<{ include: typeof workoutInclude }>;

// ---------- PR recompute ----------

/** Full PR recompute for one exercise (delete + rebuild from all sets). */
export async function recomputePRs(
  tx: Prisma.TransactionClient,
  userId: string,
  exerciseId: string,
): Promise<void> {
  const sets = await tx.trainingSet.findMany({
    where: {
      userId,
      workoutExercise: {
        exerciseId,
        workout: { removedAt: null }, // Part 8 §6.9: removed sessions excluded from PRs
      },
      weight: { not: null },
      reps: { not: null },
      isComplete: true, // only performed sets hold records
      isWarmup: false, // warm-up ramps are preparation, not performance
    },
    include: { workoutExercise: { include: { workout: true } } },
    orderBy: { createdAt: "asc" },
  });
  const best = new Map<number, { setId: string; weight: number; date: Date }>();
  for (const s of sets) {
    const reps = s.reps!;
    const weight = s.weight!;
    const date = s.workoutExercise.workout.date;
    const cur = best.get(reps);
    if (!cur || weight > cur.weight || (weight === cur.weight && date < cur.date)) {
      best.set(reps, { setId: s.id, weight, date });
    }
  }
  await tx.personalRecord.deleteMany({ where: { exerciseId } });
  for (const [reps, v] of best) {
    await tx.personalRecord.create({
      data: { id: uuid7(), userId, exerciseId, reps, weight: v.weight, setId: v.setId, date: v.date },
    });
  }
}

async function isPRForReps(userId: string, exerciseId: string, reps: number, weight: number): Promise<boolean> {
  const existing = await db.personalRecord.findUnique({
    where: { exerciseId_reps: { exerciseId, reps } },
  });
  return !existing || weight > existing.weight;
}

/** Set-mutation transaction budget: generous timeout for SQLite write-lock
 *  queues (burst of set PATCHes — e.g. apply-to-all — serialize on the lock). */
const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;

// ---------- reads ----------

export async function getWorkoutByDate(userId: string, dateInput: string | Date) {
  const date = toDayUtc(dateInput);
  // Part 8: a day may hold several sessions. The "day view" surfaces the ACTIVE
  // (unfinished, unremoved) session; otherwise the latest finished one.
  const w =
    (await db.workout.findFirst({
      where: { userId, date, removedAt: null, finishedAt: null },
      include: workoutInclude,
      orderBy: { createdAt: "desc" },
    })) ??
    (await db.workout.findFirst({
      where: { userId, date, removedAt: null },
      include: workoutInclude,
      orderBy: { createdAt: "desc" },
    }));
  return w ? mapWorkout(w) : null;
}

/** Part 8 §3.10: the in-progress session (any date) — the Logging screen target. */
export async function getActiveSession(userId: string) {
  const w = await db.workout.findFirst({
    where: { userId, removedAt: null, finishedAt: null, startAt: { not: null } },
    include: workoutInclude,
    orderBy: { startAt: "desc" },
  });
  return w ? mapWorkout(w) : null;
}

export async function getWorkout(userId: string, id: string) {
  const w = await db.workout.findFirst({ where: { id, userId }, include: workoutInclude });
  if (!w) throw notFound("Workout not found");
  return mapWorkout(w);
}

export async function listWorkouts(
  userId: string,
  opts: { from?: string; to?: string; limit?: number; search?: string; dayId?: string },
) {
  const where: Prisma.WorkoutWhereInput = { userId, removedAt: null };
  if (opts.from || opts.to) {
    where.date = {
      ...(opts.from ? { gte: toDayUtc(opts.from) } : {}),
      ...(opts.to ? { lte: toDayUtc(opts.to) } : {}),
    };
  }
  // Part 9 §8: ?dayId= filter (History action on a day).
  if (opts.dayId) where.sourceDayId = opts.dayId;
  const rows = await db.workout.findMany({
    where,
    orderBy: { date: "desc" },
    take: opts.limit ?? 500,
    include: workoutInclude,
  });
  // Case-insensitive search across comment, exercise names and category names.
  // Part 9 §8: also matches the sourceLabel (program name / "On demand" / routine name).
  // Done in JS (not Prisma `contains`) so behaviour is identical on SQLite and
  // Postgres (Prisma has no `mode: insensitive` on SQLite).
  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    return rows
      .filter(
        (w) =>
          w.comment?.toLowerCase().includes(q) ||
          (w.sourceLabel ?? "").toLowerCase().includes(q) ||
          w.sourceRoutine?.name.toLowerCase().includes(q) ||
          w.exercises.some(
            (we) =>
              we.exercise.name.toLowerCase().includes(q) ||
              we.exercise.category?.name.toLowerCase().includes(q),
          ),
      )
      .map(mapWorkoutSummary);
  }
  return rows.map(mapWorkoutSummary);
}

/** Workout tree by a date range (calendar + history screens). */
export async function getWorkoutsBetween(userId: string, from: string | Date, to: string | Date) {
  const rows = await db.workout.findMany({
    where: { userId, removedAt: null, date: { gte: toDayUtc(from), lte: toDayUtc(to) } },
    orderBy: { date: "asc" },
    include: workoutInclude,
  });
  return rows.map(mapWorkout);
}

// ---------- workout CRUD ----------

export async function createOrGetWorkout(userId: string, dateInput: string | Date) {
  const date = toDayUtc(dateInput);
  // Part 8: days hold multiple sessions. "Get or create" continues the ACTIVE
  // (unfinished) session of that date when one exists; otherwise creates fresh.
  const existing = await db.workout.findFirst({
    where: { userId, date, removedAt: null, finishedAt: null },
    include: workoutInclude,
    orderBy: { createdAt: "desc" },
  });
  if (existing) return mapWorkout(existing);
  const created = await db.workout.create({
    data: { id: uuid7(), userId, date },
    include: workoutInclude,
  });
  return mapWorkout(created);
}

export async function updateWorkout(
  userId: string,
  id: string,
  patch: { date?: string; comment?: string | null; startAt?: string | null; endAt?: string | null },
) {
  const w = await db.workout.findFirst({ where: { id, userId } });
  if (!w) throw notFound("Workout not found");

  let date = w.date;
  if (patch.date !== undefined) {
    // Part 8: several sessions per day are allowed — moving dates no longer clashes.
    date = toDayUtc(patch.date);
  }
  const updated = await db.workout.update({
    where: { id },
    data: {
      date,
      ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
      ...(patch.startAt !== undefined ? { startAt: patch.startAt ? new Date(patch.startAt) : null } : {}),
      ...(patch.endAt !== undefined ? { endAt: patch.endAt ? new Date(patch.endAt) : null } : {}),
    },
    include: workoutInclude,
  });
  return mapWorkout(updated);
}

/** DELETE /api/workouts/:id — §6.9 single remove semantics (reason USER_DELETE) + PR recompute; Undo → restore. */
export async function deleteWorkout(userId: string, id: string) {
  const w = await db.workout.findFirst({ where: { id, userId }, include: { exercises: { select: { exerciseId: true } } } });
  if (!w) throw notFound("Workout not found");
  const exerciseIds = [...new Set(w.exercises.map((e) => e.exerciseId))];
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.workout.update({ where: { id }, data: { removedAt: now, removeReason: "USER_DELETE" } });
    for (const exerciseId of exerciseIds) await recomputePRs(tx, userId, exerciseId);
  });
  return { ok: true, removedAt: now.toISOString(), removeReason: "USER_DELETE" };
}

// ---------- Part 6: discard / restore / purge (§4.11 Finish ASK + §4.12) ----------

/**
 * POST /api/workouts/:id/discard — session discard: sets removedAt (reason DISCARDED_SESSION), reverts
 * cursor/schedule effects best-effort, recomputes PRs. Hidden everywhere until
 * restored (10s client Undo window → restore).
 */
export async function discardWorkout(userId: string, id: string) {
  const w = await db.workout.findFirst({ where: { id, userId }, include: { exercises: { select: { exerciseId: true } } } });
  if (!w) throw notFound("Workout not found");
  if (w.removedAt) return { ok: true, removedAt: w.removedAt.toISOString(), removeReason: w.removeReason ?? "DISCARDED_SESSION" };

  const exerciseIds = [...new Set(w.exercises.map((e) => e.exerciseId))];
  const now = new Date();

  // Cursor revert: when this workout came from the active program's day and the
  // cursor has moved to (or past) the next day, pull it back to the source day.
  if (w.sourceRoutineId && w.sourceDayId) {
    const active = await db.activeRoutine.findFirst({ where: { userId, routineId: w.sourceRoutineId } });
    if (active) {
      const days = await db.routineDay.findMany({ where: { routineId: w.sourceRoutineId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
      const sourceIndex = days.findIndex((d) => d.id === w.sourceDayId);
      if (sourceIndex >= 0 && active.cursorDayIndex !== sourceIndex) {
        await db.activeRoutine.update({
          where: { id: active.id },
          data: { cursorDayIndex: sourceIndex, lastAdvancedAt: null, lastAdvancedForDate: null },
        });
      }
    }
  }

  // Schedule revert: linked DONE entries — past dates flip to MISSED (truthful),
  // today/future flip back to PLANNED — and every entry unlinks the workout.
  // Two collision cases need care (partial unique index: only ONE live PLANNED
  // entry per userId+date):
  //   • workout.scheduledStart === false → the DONE entry was auto-created by
  //     the start flow (nothing was planned); revert = soft-delete, not PLANNED.
  //   • another live PLANNED entry already occupies that date (the slot was
  //     re-taken while the workout was live) → revert = soft-delete.
  const linked = await db.scheduleEntry.findMany({ where: { userId, workoutId: id } });
  const todayUtc = toDayUtc(new Date());
  for (const entry of linked) {
    if (entry.status !== "DONE") continue;
    if (entry.date.getTime() < todayUtc.getTime()) {
      await db.scheduleEntry
        .update({
          where: { id: entry.id },
          data: { status: "MISSED", workoutId: null, missedAt: entry.missedAt ?? now },
        })
        .catch(() => undefined);
      continue;
    }
    const slotTaken =
      w.scheduledStart === false ||
      !!(await db.scheduleEntry.findFirst({
        where: { userId, date: entry.date, status: "PLANNED", deletedAt: null, NOT: { id: entry.id } },
        select: { id: true },
      }));
    if (slotTaken) {
      await db.scheduleEntry
        .update({ where: { id: entry.id }, data: { workoutId: null, deletedAt: now } })
        .catch(() => undefined);
    } else {
      await db.scheduleEntry
        .update({ where: { id: entry.id }, data: { status: "PLANNED", workoutId: null } })
        .catch(() => undefined);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.workout.update({ where: { id }, data: { removedAt: now, removeReason: "DISCARDED_SESSION" } });
    for (const exerciseId of exerciseIds) await recomputePRs(tx, userId, exerciseId);
  });
  return { ok: true, removedAt: now.toISOString(), removeReason: "DISCARDED_SESSION" };
}

/** POST /api/workouts/:id/restore — clears removedAt/removeReason + PR recompute (§6.9). */
export async function restoreWorkout(userId: string, id: string) {
  const w = await db.workout.findFirst({ where: { id, userId }, include: { exercises: { select: { exerciseId: true } } } });
  if (!w) throw notFound("Workout not found");
  if (!w.removedAt) return { ok: true };

  const exerciseIds = [...new Set(w.exercises.map((e) => e.exerciseId))];
  await db.$transaction(async (tx) => {
    await tx.workout.update({ where: { id }, data: { removedAt: null, removeReason: null } });
    for (const exerciseId of exerciseIds) await recomputePRs(tx, userId, exerciseId);
  });
  return { ok: true };
}

/** Hard delete (Settings → Data → "Show discarded" → Delete permanently). */
export async function purgeWorkout(userId: string, id: string) {
  const w = await db.workout.findFirst({ where: { id, userId }, include: { exercises: { select: { exerciseId: true } } } });
  if (!w) throw notFound("Workout not found");
  const exerciseIds = [...new Set(w.exercises.map((e) => e.exerciseId))];
  await db.$transaction(async (tx) => {
    await tx.workout.delete({ where: { id } });
    for (const exerciseId of exerciseIds) await recomputePRs(tx, userId, exerciseId);
  });
  return { ok: true };
}

/** GET removed workouts (§6.9 Backup & data → Removed items; 30-day auto-purge). */
export async function listRemovedWorkouts(userId: string) {
  const rows = await db.workout.findMany({
    where: { userId, removedAt: { not: null } },
    orderBy: { removedAt: "desc" },
    take: 200,
    include: { exercises: { select: { exerciseId: true } } },
  });
  return rows.map((w) => ({
    id: w.id,
    date: w.date.toISOString(),
    comment: w.comment ?? null,
    removedAt: w.removedAt?.toISOString() ?? null,
    removeReason: w.removeReason ?? null,
    exerciseCount: w.exercises.length,
  }));
}

// ---------- workout exercises ----------

export async function addWorkoutExercise(userId: string, workoutId: string, exerciseId: string) {
  const [workout, exercise] = await Promise.all([
    db.workout.findFirst({ where: { id: workoutId, userId } }),
    db.exercise.findFirst({ where: { id: exerciseId, userId } }),
  ]);
  if (!workout) throw notFound("Workout not found");
  if (!exercise) throw notFound("Exercise not found");

  const count = await db.workoutExercise.count({ where: { workoutId } });
  const created = await db.workoutExercise.create({
    data: { id: uuid7(), userId, workoutId, exerciseId, sortOrder: count },
    include: { exercise: { include: { category: true } }, sets: true },
  });
  return { workoutExerciseId: created.id, exerciseId, sets: [] };
}

export async function updateWorkoutExercise(
  userId: string,
  workoutId: string,
  weId: string,
  patch: { sortOrder?: number; groupId?: string | null; exerciseId?: string },
) {
  const we = await db.workoutExercise.findFirst({ where: { id: weId, userId, workoutId } });
  if (!we) throw notFound("Exercise not found in this workout");
  if (patch.groupId != null) {
    if (patch.groupId !== "") {
      const g = await db.workoutGroup.findFirst({ where: { id: patch.groupId, userId, workoutId } });
      if (!g) throw notFound("Group not found");
    }
  }
  // ---- Part 9 §8: log-scoped exercise swap (sets kept on the same rows) ----
  if (patch.exerciseId != null && patch.exerciseId !== we.exerciseId) {
    const exercise = await db.exercise.findFirst({ where: { id: patch.exerciseId, userId } });
    if (!exercise) throw notFound("Exercise not found");
    const oldExerciseId = we.exerciseId;
    const newExerciseId = patch.exerciseId;
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.workoutExercise.update({
        where: { id: weId },
        data: { exerciseId: newExerciseId },
      });
      // the performed sets just moved between exercises — rebuild both PRs
      await recomputePRs(tx, userId, oldExerciseId);
      await recomputePRs(tx, userId, newExerciseId);
      return row;
    });
    return { ok: true, id: updated.id };
  }
  const updated = await db.workoutExercise.update({
    where: { id: weId },
    data: {
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.groupId !== undefined ? { groupId: patch.groupId === "" ? null : patch.groupId } : {}),
    },
  });
  return { ok: true, id: updated.id };
}

export async function removeWorkoutExercise(userId: string, workoutId: string, weId: string) {
  const we = await db.workoutExercise.findFirst({
    where: { id: weId, userId, workoutId },
  });
  if (!we) throw notFound("Exercise not found in this workout");
  await db.$transaction(async (tx) => {
    await tx.workoutExercise.delete({ where: { id: weId } });
    await recomputePRs(tx, userId, we.exerciseId);
    // compact sort orders
    const rest = await tx.workoutExercise.findMany({ where: { workoutId }, orderBy: { sortOrder: "asc" } });
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].sortOrder !== i) await tx.workoutExercise.update({ where: { id: rest[i].id }, data: { sortOrder: i } });
    }
  });
  return { ok: true };
}

export async function reorderWorkoutExercises(userId: string, workoutId: string, ids: string[]) {
  const workout = await db.workout.findFirst({ where: { id: workoutId, userId } });
  if (!workout) throw notFound("Workout not found");
  await db.$transaction(
    ids.map((id, i) =>
      db.workoutExercise.updateMany({ where: { id, userId, workoutId }, data: { sortOrder: i } }),
    ),
  );
  return { ok: true };
}

// ---------- sets ----------

async function getWorkoutExerciseOwned(userId: string, workoutId: string, weId: string) {
  const we = await db.workoutExercise.findFirst({
    where: { id: weId, userId, workoutId },
    include: { workout: true, exercise: true },
  });
  if (!we) throw notFound("Exercise not found in this workout");
  return we;
}

export type SetFieldsInput = {
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
  comment?: string | null;
  isComplete?: boolean;
  isWarmup?: boolean;
  // ---- Part 2 ----
  setType?: string;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  restActualSec?: number | null;
  completedAt?: string | null;
};

/** setType ⟺ isWarmup single source of truth: WARMUP type mirrors the legacy flag. */
function syncWarmup(input: SetFieldsInput): { setType?: string; isWarmup?: boolean } {
  if (input.setType !== undefined) {
    return { setType: input.setType, isWarmup: input.setType === "WARMUP" };
  }
  if (input.isWarmup !== undefined) {
    return { isWarmup: input.isWarmup, ...(input.isWarmup ? { setType: "WARMUP" } : {}) };
  }
  return {};
}

/** When a set turns complete: stamp completedAt and derive restActualSec
 *  from the most recent earlier completed set in the same exercise. */
function completionTimestamps(
  now: Date,
  input: SetFieldsInput,
  prevCompletedAt: Date | null,
): { completedAt?: Date | null; restActualSec?: number | null } {
  if (input.isComplete === true) {
    const completedAt = input.completedAt ? new Date(input.completedAt) : now;
    const restActualSec =
      input.restActualSec != null
        ? input.restActualSec
        : prevCompletedAt
          ? Math.max(0, Math.round((completedAt.getTime() - prevCompletedAt.getTime()) / 1000))
          : null;
    return { completedAt, ...(restActualSec != null ? { restActualSec } : {}) };
  }
  if (input.isComplete === false) return { completedAt: null, restActualSec: null };
  return {};
}

export async function createSet(
  userId: string,
  workoutId: string,
  weId: string,
  input: SetFieldsInput,
) {
  const we = await getWorkoutExerciseOwned(userId, workoutId, weId);
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const trackPR = settings?.trackPR ?? true;

  const count = await db.trainingSet.count({ where: { workoutExerciseId: weId } });
  const warmupSync = syncWarmup(input);
  const effectiveType = warmupSync.setType ?? "NORMAL";
  const effectiveWarmup = warmupSync.isWarmup ?? effectiveType === "WARMUP";
  const newPr =
    trackPR &&
    !effectiveWarmup &&
    input.weight != null &&
    input.reps != null &&
    (await isPRForReps(userId, we.exerciseId, input.reps, input.weight));

  // previous completed set in this exercise (for restActualSec)
  const prevCompleted = await db.trainingSet.findFirst({
    where: { workoutExerciseId: weId, isComplete: true, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  const stamps = completionTimestamps(new Date(), input, prevCompleted?.completedAt ?? null);

  // Timeout headroom: concurrent set PATCHes (e.g. the §4.10d apply-to-all
  // fan-out) serialize on the SQLite write lock — the 5s default expires while
  // queued. 15s budget / 5s acquisition keeps every request green under burst.
  const created = await db.$transaction(
    async (tx) => {
      const set = await tx.trainingSet.create({
        data: {
          id: uuid7(),
          userId,
          workoutExerciseId: weId,
          weight: input.weight ?? null,
          reps: input.reps ?? null,
          distance: input.distance ?? null,
          timeSec: input.timeSec ?? null,
          comment: input.comment ?? null,
          isComplete: input.isComplete ?? false,
          isWarmup: effectiveWarmup,
          setType: effectiveType,
          rpe: input.rpe ?? null,
          tempo: input.tempo ?? null,
          restPlannedSec: input.restPlannedSec ?? null,
          ...(stamps.completedAt !== undefined ? { completedAt: stamps.completedAt } : {}),
          ...(stamps.restActualSec !== undefined ? { restActualSec: stamps.restActualSec } : {}),
          sortOrder: count,
        },
      });
      await recomputePRs(tx, userId, we.exerciseId);
      return set;
    },
    TX_OPTIONS,
  );
  return mapSet(created, newPr);
}

export async function updateSet(
  userId: string,
  workoutId: string,
  weId: string,
  setId: string,
  input: SetFieldsInput,
) {
  const we = await getWorkoutExerciseOwned(userId, workoutId, weId);
  const existing = await db.trainingSet.findFirst({ where: { id: setId, workoutExerciseId: weId } });
  if (!existing) throw notFound("Set not found");

  const warmupSync = syncWarmup(input);
  // previous completed set BEFORE this one (sortOrder-based) for restActualSec
  let prevCompletedAt: Date | null = null;
  if (input.isComplete === true && !existing.completedAt) {
    const prev = await db.trainingSet.findFirst({
      where: { workoutExerciseId: weId, isComplete: true, completedAt: { not: null }, id: { not: setId } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    prevCompletedAt = prev?.completedAt ?? null;
  }
  const stamps = completionTimestamps(new Date(), input, prevCompletedAt);

  const updated = await db.$transaction(
    async (tx) => {
      const set = await tx.trainingSet.update({
        where: { id: setId },
        data: {
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
          ...(input.reps !== undefined ? { reps: input.reps } : {}),
          ...(input.distance !== undefined ? { distance: input.distance } : {}),
          ...(input.timeSec !== undefined ? { timeSec: input.timeSec } : {}),
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          ...(input.isComplete !== undefined ? { isComplete: input.isComplete } : {}),
          ...(input.isWarmup !== undefined ? { isWarmup: input.isWarmup } : {}),
          // ---- Part 2 ----
          ...(warmupSync.setType !== undefined ? { setType: warmupSync.setType } : {}),
          ...(warmupSync.isWarmup !== undefined ? { isWarmup: warmupSync.isWarmup } : {}),
          ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
          ...(input.tempo !== undefined ? { tempo: input.tempo } : {}),
          ...(input.restPlannedSec !== undefined ? { restPlannedSec: input.restPlannedSec } : {}),
          ...(input.restActualSec !== undefined ? { restActualSec: input.restActualSec } : {}),
          ...(stamps.completedAt !== undefined ? { completedAt: stamps.completedAt } : {}),
          ...(stamps.restActualSec !== undefined ? { restActualSec: stamps.restActualSec } : {}),
        },
      });
      await recomputePRs(tx, userId, we.exerciseId);
      return set;
    },
    TX_OPTIONS,
  );
  return mapSet(updated);
}

export async function deleteSet(userId: string, workoutId: string, weId: string, setId: string) {
  const we = await getWorkoutExerciseOwned(userId, workoutId, weId);
  const existing = await db.trainingSet.findFirst({ where: { id: setId, workoutExerciseId: weId } });
  if (!existing) throw notFound("Set not found");
  await db.$transaction(
    async (tx) => {
      await tx.trainingSet.delete({ where: { id: setId } });
      await recomputePRs(tx, userId, we.exerciseId);
      const rest = await tx.trainingSet.findMany({ where: { workoutExerciseId: weId }, orderBy: { sortOrder: "asc" } });
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].sortOrder !== i) await tx.trainingSet.update({ where: { id: rest[i].id }, data: { sortOrder: i } });
      }
    },
    TX_OPTIONS,
  );
  return { ok: true };
}

export async function reorderSets(userId: string, workoutId: string, weId: string, ids: string[]) {
  await getWorkoutExerciseOwned(userId, workoutId, weId);
  await db.$transaction(
    ids.map((id, i) => db.trainingSet.updateMany({ where: { id, userId, workoutExerciseId: weId }, data: { sortOrder: i } })),
  );
  return { ok: true };
}

// ---------- groups (supersets) ----------

export async function createGroup(
  userId: string,
  workoutId: string,
  input: { name: string; colour?: string; exerciseIds?: string[] },
) {
  const workout = await db.workout.findFirst({ where: { id: workoutId, userId } });
  if (!workout) throw notFound("Workout not found");
  const group = await db.workoutGroup.create({
    data: { id: uuid7(), userId, workoutId, name: input.name, colour: input.colour ?? "#f97316" },
  });
  if (input.exerciseIds?.length) {
    await db.workoutExercise.updateMany({
      where: { id: { in: input.exerciseIds }, userId, workoutId },
      data: { groupId: group.id },
    });
  }
  return mapGroup(group);
}

export async function updateGroup(userId: string, workoutId: string, groupId: string, patch: { name?: string; colour?: string }) {
  const g = await db.workoutGroup.findFirst({ where: { id: groupId, userId, workoutId } });
  if (!g) throw notFound("Group not found");
  const updated = await db.workoutGroup.update({
    where: { id: groupId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.colour !== undefined ? { colour: patch.colour } : {}),
    },
  });
  return mapGroup(updated);
}

export async function deleteGroup(userId: string, workoutId: string, groupId: string) {
  const g = await db.workoutGroup.findFirst({ where: { id: groupId, userId, workoutId } });
  if (!g) throw notFound("Group not found");
  await db.workoutGroup.delete({ where: { id: groupId } }); // FK SetNull ungroups exercises
  return { ok: true };
}

// ---------- copy / move ----------

/** Copy sets from another workout (default: the most recent before the target date). */
export async function copyWorkout(
  userId: string,
  targetWorkoutId: string,
  input: { fromDate?: string; setIds?: string[] },
) {
  const target = await db.workout.findFirst({ where: { id: targetWorkoutId, userId }, include: workoutInclude });
  if (!target) throw notFound("Workout not found");

  let source: WorkoutFull | null = null;
  if (input.fromDate) {
    source = await db.workout.findFirst({
      where: { userId, date: toDayUtc(input.fromDate), removedAt: null },
      include: workoutInclude,
      orderBy: { createdAt: "desc" },
    });
  } else {
    source = await db.workout.findFirst({
      where: { userId, date: { lt: target.date } },
      orderBy: { date: "desc" },
      include: workoutInclude,
    });
  }
  if (!source) throw notFound("No source workout found to copy");

  const setFilter = input.setIds ? new Set(input.setIds) : null;
  const affected = new Set<string>();

  // map source group name → target group
  const groupMap = new Map<string, string>();
  for (const g of source.groups) {
    const existing = target.groups.find((tg) => tg.name === g.name);
    if (existing) {
      groupMap.set(g.id, existing.id);
    } else {
      const created = await db.workoutGroup.create({
        data: { id: uuid7(), userId, workoutId: target.id, name: g.name, colour: g.colour },
      });
      groupMap.set(g.id, created.id);
    }
  }

  let sortOrder = await db.workoutExercise.count({ where: { workoutId: target.id } });
  for (const swe of source.exercises) {
    const sets = setFilter ? swe.sets.filter((s) => setFilter.has(s.id)) : swe.sets;
    if (sets.length === 0) continue;
    affected.add(swe.exerciseId);
    // find-or-create target workout exercise
    let twe = await db.workoutExercise.findFirst({ where: { workoutId: target.id, exerciseId: swe.exerciseId } });
    if (!twe) {
      twe = await db.workoutExercise.create({
        data: {
          id: uuid7(),
          userId,
          workoutId: target.id,
          exerciseId: swe.exerciseId,
          sortOrder: sortOrder++,
          groupId: swe.groupId ? groupMap.get(swe.groupId) ?? null : null,
        },
      });
    } else if (swe.groupId && !twe.groupId) {
      await db.workoutExercise.update({ where: { id: twe.id }, data: { groupId: groupMap.get(swe.groupId) ?? null } });
    }
    let setOrder = await db.trainingSet.count({ where: { workoutExerciseId: twe.id } });
    for (const s of sets) {
      await db.trainingSet.create({
        data: {
          id: uuid7(),
          userId,
          workoutExerciseId: twe.id,
          weight: s.weight,
          reps: s.reps,
          distance: s.distance,
          timeSec: s.timeSec,
          comment: s.comment,
          isComplete: false,
          isWarmup: s.isWarmup,
          sortOrder: setOrder++,
        },
      });
    }
  }
  await db.$transaction(async (tx) => {
    for (const exerciseId of affected) await recomputePRs(tx, userId, exerciseId);
  });
  return getWorkout(userId, target.id);
}

/** Move the whole workout (or selected exercises) to another date. */
export async function moveWorkout(
  userId: string,
  workoutId: string,
  input: { toDate: string; workoutExerciseIds?: string[] },
) {
  const source = await db.workout.findFirst({ where: { id: workoutId, userId }, include: workoutInclude });
  if (!source) throw notFound("Workout not found");
  const newDate = toDayUtc(input.toDate);
  if (newDate.getTime() === source.date.getTime() && !input.workoutExerciseIds?.length) {
    return getWorkout(userId, source.id); // no-op
  }

  const movingAll = !input.workoutExerciseIds?.length;
  const movingIds = new Set(input.workoutExerciseIds ?? []);

  // find-or-create target workout at newDate (active session first)
  let target = await db.workout.findFirst({
    where: { userId, date: newDate, removedAt: null, finishedAt: null },
    include: workoutInclude,
    orderBy: { createdAt: "desc" },
  });
  if (!target) {
    target = await db.workout.create({ data: { id: uuid7(), userId, date: newDate }, include: workoutInclude });
  } else if (target.id === source.id) {
    return updateWorkout(userId, source.id, { date: input.toDate });
  }

  const toMove = source.exercises.filter((we) => movingAll || movingIds.has(we.id));
  let sortOrder = target.exercises.length;
  for (const swe of toMove) {
    await db.workoutExercise.update({ where: { id: swe.id }, data: { workoutId: target.id, sortOrder: sortOrder++, groupId: null } });
  }
  // copy groups of moved exercises into target
  const groupMap = new Map<string, string>();
  for (const g of source.groups) {
    const hasMoved = toMove.some((we) => we.groupId === g.id);
    if (!hasMoved) continue;
    const existing = target.groups.find((tg) => tg.name === g.name);
    const g2 = existing ?? (await db.workoutGroup.create({ data: { id: uuid7(), userId, workoutId: target.id, name: g.name, colour: g.colour } }));
    groupMap.set(g.id, g2.id);
  }
  for (const swe of toMove) {
    if (swe.groupId && groupMap.has(swe.groupId)) {
      await db.workoutExercise.update({ where: { id: swe.id }, data: { groupId: groupMap.get(swe.groupId)! } });
    }
  }

  const remaining = await db.workoutExercise.count({ where: { workoutId: source.id } });
  if (remaining === 0) {
    await db.workout.delete({ where: { id: source.id } });
  } else {
    const rest = await db.workoutExercise.findMany({ where: { workoutId: source.id }, orderBy: { sortOrder: "asc" } });
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].sortOrder !== i) await db.workoutExercise.update({ where: { id: rest[i].id }, data: { sortOrder: i } });
    }
  }
  return getWorkout(userId, target.id);
}

// ---------- misc helpers used by other services ----------

export async function previousWorkoutDate(userId: string, beforeDate?: string | Date): Promise<string | null> {
  const d = beforeDate ? toDayUtc(beforeDate) : todayDayUtc();
  const prev = await db.workout.findFirst({ where: { userId, date: { lt: d } }, orderBy: { date: "desc" } });
  return prev ? dayKeyIso(prev.date) : null;
}

function dayKeyIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type { WorkoutFull };
