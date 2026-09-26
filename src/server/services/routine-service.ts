// Routine templates + "log all" (routine day → today's workout).
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { toDayUtc } from "@/lib/dates";
import { mapRoutine } from "../mappers";
import { badRequest, notFound } from "../http";
import { recomputePRs } from "./workout-service";
import type { Prisma } from "@prisma/client";

const routineInclude = {
  days: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      exercises: {
        orderBy: { sortOrder: "asc" as const },
        include: { exercise: { include: { category: true } }, sets: { orderBy: { sortOrder: "asc" as const } } },
      },
    },
  },
} satisfies Prisma.RoutineInclude;

type RoutineFull = Prisma.RoutineGetPayload<{ include: typeof routineInclude }>;

export async function listRoutines(userId: string) {
  const rows = await db.routine.findMany({ where: { userId, deletedAt: null }, orderBy: { sortOrder: "asc" }, include: routineInclude });
  return rows.map(mapRoutine);
}

export async function getRoutine(userId: string, id: string) {
  const r = await db.routine.findFirst({ where: { id, userId, deletedAt: null }, include: routineInclude });
  if (!r) throw notFound("Routine not found");
  return mapRoutine(r);
}

export async function createRoutine(userId: string, input: { name: string; notes?: string | null }) {
  const count = await db.routine.count({ where: { userId } });
  const created = await db.routine.create({
    data: { id: uuid7(), userId, name: input.name.trim(), notes: input.notes ?? null, sortOrder: count },
    include: routineInclude,
  });
  return mapRoutine(created);
}

export async function updateRoutine(userId: string, id: string, patch: { name?: string; notes?: string | null; sortOrder?: number }) {
  const r = await db.routine.findFirst({ where: { id, userId } });
  if (!r) throw notFound("Routine not found");
  const updated = await db.routine.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
    include: routineInclude,
  });
  return mapRoutine(updated);
}

export async function deleteRoutine(userId: string, id: string) {
  const r = await db.routine.findFirst({ where: { id, userId } });
  if (!r) throw notFound("Routine not found");
  await db.routine.delete({ where: { id } });
  return { ok: true };
}

export async function copyRoutine(userId: string, id: string) {
  const r = await db.routine.findFirst({ where: { id, userId }, include: routineInclude });
  if (!r) throw notFound("Routine not found");
  const count = await db.routine.count({ where: { userId } });
  const created = await db.routine.create({
    data: { id: uuid7(), userId, name: `${r.name} (Copy)`, notes: r.notes, sortOrder: count },
  });
  for (const day of r.days) {
    const nd = await db.routineDay.create({
      data: { id: uuid7(), userId, routineId: created.id, name: day.name, sortOrder: day.sortOrder },
    });
    for (const re of day.exercises) {
      const nre = await db.routineExercise.create({
        data: { id: uuid7(), userId, dayId: nd.id, exerciseId: re.exerciseId, sortOrder: re.sortOrder },
      });
      for (const s of re.sets) {
        await db.predefinedSet.create({
          data: {
            id: uuid7(),
            routineExerciseId: nre.id,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            timeSec: s.timeSec,
            sortOrder: s.sortOrder,
          },
        });
      }
    }
  }
  return getRoutine(userId, created.id);
}

// ---------- days ----------

export async function createRoutineDay(userId: string, routineId: string, input: { name: string }) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId } });
  if (!r) throw notFound("Routine not found");
  const count = await db.routineDay.count({ where: { routineId } });
  await db.routineDay.create({
    data: { id: uuid7(), userId, routineId, name: input.name.trim(), sortOrder: count },
  });
  return getRoutine(userId, routineId);
}

export async function updateRoutineDay(userId: string, routineId: string, dayId: string, patch: { name?: string; sortOrder?: number }) {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId, routineId } });
  if (!day) throw notFound("Day not found");
  await db.routineDay.update({
    where: { id: dayId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  return getRoutine(userId, routineId);
}

export async function deleteRoutineDay(userId: string, routineId: string, dayId: string) {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId, routineId } });
  if (!day) throw notFound("Day not found");
  await db.routineDay.delete({ where: { id: dayId } });
  return getRoutine(userId, routineId);
}

// ---------- routine exercises ----------

export async function addRoutineExercise(userId: string, routineId: string, dayId: string, exerciseId: string) {
  const [day, exercise] = await Promise.all([
    db.routineDay.findFirst({ where: { id: dayId, userId, routineId } }),
    db.exercise.findFirst({ where: { id: exerciseId, userId } }),
  ]);
  if (!day) throw notFound("Day not found");
  if (!exercise) throw badRequest("Exercise not found");
  const count = await db.routineExercise.count({ where: { dayId } });
  await db.routineExercise.create({
    data: { id: uuid7(), userId, dayId, exerciseId, sortOrder: count },
  });
  return getRoutine(userId, routineId);
}

export async function updateRoutineExercise(
  userId: string,
  routineId: string,
  dayId: string,
  reId: string,
  patch: { sortOrder?: number; groupId?: string | null },
) {
  const re = await db.routineExercise.findFirst({ where: { id: reId, userId, dayId } });
  if (!re) throw notFound("Exercise not found in this day");
  await db.routineExercise.update({
    where: { id: reId },
    data: {
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.groupId !== undefined ? { groupId: patch.groupId === "" ? null : patch.groupId } : {}),
    },
  });
  return getRoutine(userId, routineId);
}

export async function removeRoutineExercise(userId: string, routineId: string, dayId: string, reId: string) {
  const re = await db.routineExercise.findFirst({ where: { id: reId, userId, dayId } });
  if (!re) throw notFound("Exercise not found in this day");
  await db.routineExercise.delete({ where: { id: reId } });
  return getRoutine(userId, routineId);
}

export async function reorderRoutineExercises(userId: string, routineId: string, dayId: string, ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.routineExercise.updateMany({ where: { id, userId, dayId }, data: { sortOrder: i } })));
  return getRoutine(userId, routineId);
}

// ---------- predefined sets ----------

export async function addPredefinedSet(
  userId: string,
  routineId: string,
  dayId: string,
  reId: string,
  input: {
    weight?: number | null;
    reps?: number | null;
    distance?: number | null;
    timeSec?: number | null;
    setType?: string | null;
    rpe?: number | null;
    tempo?: string | null;
    restPlannedSec?: number | null;
  },
) {
  const re = await db.routineExercise.findFirst({ where: { id: reId, userId, dayId } });
  if (!re) throw notFound("Exercise not found in this day");
  const count = await db.predefinedSet.count({ where: { routineExerciseId: reId } });
  await db.predefinedSet.create({
    data: {
      id: uuid7(),
      routineExerciseId: reId,
      weight: input.weight ?? null,
      reps: input.reps ?? null,
      distance: input.distance ?? null,
      timeSec: input.timeSec ?? null,
      setType: input.setType ?? null,
      rpe: input.rpe ?? null,
      tempo: input.tempo ?? null,
      restPlannedSec: input.restPlannedSec ?? null,
      sortOrder: count,
    },
  });
  return getRoutine(userId, routineId);
}

export async function updatePredefinedSet(
  userId: string,
  routineId: string,
  dayId: string,
  reId: string,
  setId: string,
  input: {
    weight?: number | null;
    reps?: number | null;
    distance?: number | null;
    timeSec?: number | null;
    setType?: string | null;
    rpe?: number | null;
    tempo?: string | null;
    restPlannedSec?: number | null;
  },
) {
  const s = await db.predefinedSet.findFirst({ where: { id: setId, routineExerciseId: reId } });
  if (!s) throw notFound("Set not found");
  await db.predefinedSet.update({
    where: { id: setId },
    data: {
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.reps !== undefined ? { reps: input.reps } : {}),
      ...(input.distance !== undefined ? { distance: input.distance } : {}),
      ...(input.timeSec !== undefined ? { timeSec: input.timeSec } : {}),
      ...(input.setType !== undefined ? { setType: input.setType } : {}),
      ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
      ...(input.tempo !== undefined ? { tempo: input.tempo } : {}),
      ...(input.restPlannedSec !== undefined ? { restPlannedSec: input.restPlannedSec } : {}),
    },
  });
  return getRoutine(userId, routineId);
}

export async function removePredefinedSet(userId: string, routineId: string, dayId: string, reId: string, setId: string) {
  const s = await db.predefinedSet.findFirst({ where: { id: setId, routineExerciseId: reId } });
  if (!s) throw notFound("Set not found");
  await db.predefinedSet.delete({ where: { id: setId } });
  return getRoutine(userId, routineId);
}

// ---------- log routine day → workout ----------

/**
 * "Log All": append the routine day's exercises to the workout at `date` (created if missing).
 * Predefined sets with ALL null values = "copy previous" (pulls sets from the last workout with that exercise).
 * Returns the updated workout.
 */
export async function logRoutineDay(userId: string, routineId: string, input: { dayId: string; date: string }) {
  const routine = await db.routine.findFirst({ where: { id: routineId, userId }, include: routineInclude });
  if (!routine) throw notFound("Routine not found");
  const day = routine.days.find((d) => d.id === input.dayId);
  if (!day) throw notFound("Day not found");
  const date = toDayUtc(input.date);

  const workout = await db.workout.upsert({
    where: { userId_date: { userId, date } },
    update: {},
    create: { id: uuid7(), userId, date },
  });

  // create routine groups in workout for exercises that belong to groups
  const routineGroupIds = new Set(day.exercises.map((e) => e.groupId).filter(Boolean));
  const groupMap = new Map<string, string>();
  for (const gid of routineGroupIds) {
    const rg = await db.routineGroup.findFirst({ where: { id: gid!, userId } });
    if (!rg) continue;
    const existing = await db.workoutGroup.findFirst({ where: { workoutId: workout.id, name: rg.name } });
    const g = existing ?? (await db.workoutGroup.create({
      data: { id: uuid7(), userId, workoutId: workout.id, name: rg.name, colour: rg.colour },
    }));
    groupMap.set(gid!, g.id);
  }

  const affected = new Set<string>();
  let sortOrder = await db.workoutExercise.count({ where: { workoutId: workout.id } });

  for (const re of day.exercises) {
    affected.add(re.exerciseId);
    // find-or-create workout exercise
    let twe = await db.workoutExercise.findFirst({ where: { workoutId: workout.id, exerciseId: re.exerciseId } });
    if (!twe) {
      twe = await db.workoutExercise.create({
        data: {
          id: uuid7(),
          userId,
          workoutId: workout.id,
          exerciseId: re.exerciseId,
          sortOrder: sortOrder++,
          groupId: re.groupId ? groupMap.get(re.groupId) ?? null : null,
        },
      });
    } else if (re.groupId && !twe.groupId) {
      await db.workoutExercise.update({ where: { id: twe.id }, data: { groupId: groupMap.get(re.groupId) ?? null } });
    }

    const predefined = re.sets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    let setsToAdd: Array<{
      weight: number | null;
      reps: number | null;
      distance: number | null;
      timeSec: number | null;
      setType: string | null;
      rpe: number | null;
      tempo: string | null;
      restPlannedSec: number | null;
    }>;

    const isBlank = predefined.length > 0 && predefined.every((s) => s.weight == null && s.reps == null && s.distance == null && s.timeSec == null);
    if (isBlank) {
      // copy previous: pull sets from the last workout containing this exercise before `date`
      const prev = await db.workoutExercise.findFirst({
        where: { userId, exerciseId: re.exerciseId, workout: { date: { lt: date } } },
        include: { sets: { orderBy: { sortOrder: "asc" } } },
        orderBy: { workout: { date: "desc" } },
      });
      setsToAdd = prev
        ? prev.sets.map((s) => ({
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            timeSec: s.timeSec,
            setType: s.setType ?? null,
            rpe: s.rpe ?? null,
            tempo: s.tempo ?? null,
            restPlannedSec: s.restPlannedSec ?? null,
          }))
        : [];
    } else {
      setsToAdd = predefined.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        distance: s.distance,
        timeSec: s.timeSec,
        setType: s.setType ?? null,
        rpe: s.rpe ?? null,
        tempo: s.tempo ?? null,
        restPlannedSec: s.restPlannedSec ?? null,
      }));
    }

    let setOrder = await db.trainingSet.count({ where: { workoutExerciseId: twe.id } });
    for (const s of setsToAdd) {
      await db.trainingSet.create({
        data: {
          id: uuid7(),
          userId,
          workoutExerciseId: twe.id,
          weight: s.weight,
          reps: s.reps,
          distance: s.distance,
          timeSec: s.timeSec,
          setType: s.setType ?? "NORMAL",
          isWarmup: s.setType === "WARMUP",
          rpe: s.rpe,
          tempo: s.tempo,
          restPlannedSec: s.restPlannedSec,
          sortOrder: setOrder++,
        },
      });
    }
  }

  await db.$transaction(async (tx) => {
    for (const exerciseId of affected) await recomputePRs(tx, userId, exerciseId);
  });

  const { getWorkout } = await import("./workout-service");
  return getWorkout(userId, workout.id);
}
