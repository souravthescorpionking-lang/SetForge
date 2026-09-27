// Routine templates + "log all" (routine day → today's workout).
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { toDayUtc } from "@/lib/dates";
import { mapRoutine } from "../mappers";
import { badRequest, notFound } from "../http";
import { recomputePRs } from "./workout-service";
import { appendDayToWorkout, applyProgramRules } from "./program-service";
import { workoutInclude as workoutIncludeTx } from "./workout-service";
import { isValidSession, isFollowable } from "./program-rules";
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

export async function createRoutine(userId: string, input: { name: string; notes?: string | null; kind?: string }) {
  const kind = input.kind === "SESSION" ? "SESSION" : "ROUTINE";
  const count = await db.routine.count({ where: { userId } });
  const created = await db.routine.create({
    data: { id: uuid7(), userId, name: input.name.trim(), notes: input.notes ?? null, kind, sortOrder: count },
    include: routineInclude,
  });
  return mapRoutine(created);
}

export async function updateRoutine(
  userId: string,
  id: string,
  patch: { name?: string; notes?: string | null; sortOrder?: number; kind?: string },
) {
  const r = await db.routine.findFirst({ where: { id, userId }, include: routineInclude });
  if (!r) throw notFound("Routine not found");

  if (patch.kind !== undefined && patch.kind !== (r.kind ?? "ROUTINE")) {
    const nextKind = patch.kind === "SESSION" ? "SESSION" : "ROUTINE";
    if (nextKind === "SESSION") {
      if (!isValidSession("SESSION", r.days)) {
        throw badRequest("A session needs exactly one workout day (rest days are not allowed)");
      }
      const active = await db.activeRoutine.findFirst({ where: { userId, routineId: id } });
      if (active) throw badRequest("Unfollow this program before converting it to a session");
    }
    const updated = await db.routine.update({
      where: { id },
      data: { kind: nextKind },
      include: routineInclude,
    });
    return mapRoutine(updated);
  }

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

export async function createRoutineDay(
  userId: string,
  routineId: string,
  input: { name: string; dayType?: string },
) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId } });
  if (!r) throw notFound("Routine not found");
  const dayType = input.dayType === "REST" ? "REST" : "WORKOUT";
  if ((r.kind ?? "ROUTINE") === "SESSION") {
    throw badRequest("A session has exactly one workout day — convert it to a routine to add days");
  }
  const count = await db.routineDay.count({ where: { routineId } });
  await db.routineDay.create({
    data: { id: uuid7(), userId, routineId, name: input.name.trim(), dayType, sortOrder: count },
  });
  return getRoutine(userId, routineId);
}

export async function updateRoutineDay(
  userId: string,
  routineId: string,
  dayId: string,
  patch: { name?: string; sortOrder?: number; dayType?: string },
) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId }, include: routineInclude });
  if (!r) throw notFound("Routine not found");
  const day = r.days.find((d) => d.id === dayId);
  if (!day) throw notFound("Day not found");

  if (patch.dayType !== undefined && patch.dayType !== (day.dayType ?? "WORKOUT")) {
    const nextType = patch.dayType === "REST" ? "REST" : "WORKOUT";
    if ((r.kind ?? "ROUTINE") === "SESSION") {
      throw badRequest("A session day is always a workout day");
    }
    if (nextType === "REST") {
      const workoutDaysAfter = r.days.filter((d) => d.id !== dayId && (d.dayType ?? "WORKOUT") !== "REST");
      if (workoutDaysAfter.length === 0) {
        throw badRequest("A routine needs at least one workout day");
      }
    }
  }

  await db.routineDay.update({
    where: { id: dayId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.dayType !== undefined ? { dayType: patch.dayType === "REST" ? "REST" : "WORKOUT" } : {}),
    },
  });
  return getRoutine(userId, routineId);
}

export async function deleteRoutineDay(userId: string, routineId: string, dayId: string) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId }, include: routineInclude });
  if (!r) throw notFound("Routine not found");
  const day = r.days.find((d) => d.id === dayId);
  if (!day) throw notFound("Day not found");
  if ((r.kind ?? "ROUTINE") === "SESSION") {
    throw badRequest("A session needs its workout day — delete the session instead");
  }
  await db.routineDay.delete({ where: { id: dayId } });
  // clamp the cursor if it now points beyond the last day
  const active = await db.activeRoutine.findFirst({ where: { userId, routineId } });
  if (active) {
    const remaining = await db.routineDay.count({ where: { routineId } });
    if (active.cursorDayIndex >= remaining) {
      await db.activeRoutine.update({
        where: { id: active.id },
        data: { cursorDayIndex: Math.max(0, remaining - 1) },
      });
    }
  }
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
 * "Log All" (legacy routine-day logging + Part 5 provenance):
 * appends the routine day's exercises to the workout at `date` (created if
 * missing), stamps provenance, links/creates the schedule DONE entry, then runs
 * the cursor rules. Predefined sets with ALL null values = "copy previous".
 */
export async function logRoutineDay(userId: string, routineId: string, input: { dayId: string; date: string }) {
  const routine = await db.routine.findFirst({ where: { id: routineId, userId }, include: routineInclude });
  if (!routine) throw notFound("Routine not found");
  const day = routine.days.find((d) => d.id === input.dayId);
  if (!day) throw notFound("Day not found");
  if ((day.dayType ?? "WORKOUT") === "REST") throw badRequest("Cannot log a rest day");
  const date = toDayUtc(input.date);

  const planned = await db.scheduleEntry.findFirst({
    where: { userId, date, status: "PLANNED", deletedAt: null },
  });
  const wasScheduled =
    !!planned && planned.routineId === routine.id && planned.dayId === day.id;

  const workout = await db.$transaction(async (tx) => {
    const w = await tx.workout.upsert({
      where: { userId_date: { userId, date } },
      update: {},
      create: { id: uuid7(), userId, date },
    });
    await tx.workout.update({
      where: { id: w.id },
      data: {
        sourceType: (routine.kind ?? "ROUTINE") === "SESSION" ? "SESSION" : "ROUTINE_DAY",
        sourceRoutineId: routine.id,
        sourceDayId: day.id,
        scheduledStart: wasScheduled,
        startAt: w.startAt ?? new Date(),
      },
    });
    const affected = await appendDayToWorkout(tx, userId, day, w.id, date);
    for (const exerciseId of affected) await recomputePRs(tx, userId, exerciseId);

    if (planned && wasScheduled) {
      await tx.scheduleEntry.update({ where: { id: planned.id }, data: { status: "DONE", workoutId: w.id } });
    } else if (!planned) {
      await tx.scheduleEntry.create({
        data: {
          id: uuid7(),
          userId,
          date,
          sourceType: (routine.kind ?? "ROUTINE") === "SESSION" ? "SESSION" : "ROUTINE_DAY",
          routineId: routine.id,
          dayId: day.id,
          status: "DONE",
          workoutId: w.id,
        },
      });
    }
    return tx.workout.findUnique({ where: { id: w.id }, include: workoutIncludeTx });
  });

  // converge the cursor (FIRST_SET could already qualify via copied sets)
  await applyProgramRules(userId);

  const { getWorkout } = await import("./workout-service");
  return getWorkout(userId, workout!.id);
}
