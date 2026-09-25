// Records (actual + estimated), graphs, stats, goals.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { estOneRm, estRm, totalVolume, totalReps, speed, paceSec } from "@/lib/formulas";
import { toDayUtc, todayDayUtc, addDays, dayKey } from "@/lib/dates";
import { mapRecords, mapGoal } from "../mappers";
import { notFound, badRequest } from "../http";
import { recomputePRs } from "./workout-service";
import type { GraphPointDTO } from "@/lib/types";

type SetLike = { weight: number | null; reps: number | null; distance: number | null; timeSec: number | null; date: Date };

async function allSetsForExercise(userId: string, exerciseId: string): Promise<SetLike[]> {
  const wes = await db.workoutExercise.findMany({
    where: { userId, exerciseId },
    include: { workout: { select: { date: true } }, sets: true },
  });
  const out: SetLike[] = [];
  for (const we of wes) {
    for (const s of we.sets) {
      out.push({ weight: s.weight, reps: s.reps, distance: s.distance, timeSec: s.timeSec, date: we.workout.date });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------- records ----------

/** Summary of best lifts across all exercises (Records screen). */
export async function listAllRecords(userId: string) {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const repLimit = settings?.estOneRmRepLimit ?? 10;
  const exercises = await db.exercise.findMany({ where: { userId }, include: { category: true }, orderBy: { name: "asc" } });
  const out = [];
  for (const ex of exercises) {
    const sets = await allSetsForExercise(userId, ex.id);
    if (sets.length === 0) continue;
    let bestWeight = 0;
    let bestWeightReps = 0;
    let bestWeightDate: string | null = null;
    let oneRm = 0;
    let volume = 0;
    for (const s of sets) {
      volume += (s.weight ?? 0) * (s.reps ?? 0);
      if (s.weight != null && s.reps != null && s.reps <= repLimit && s.reps >= 1) {
        const e = estOneRm(s.weight, s.reps);
        if (e > oneRm) oneRm = e;
      }
      if ((s.weight ?? 0) > bestWeight) {
        bestWeight = s.weight!;
        bestWeightReps = s.reps ?? 0;
        bestWeightDate = dayKey(s.date);
      }
    }
    out.push({
      exerciseId: ex.id,
      exerciseName: ex.name,
      categoryColour: ex.category?.colour ?? null,
      setCount: sets.length,
      bestWeight: bestWeight > 0 ? bestWeight : null,
      bestWeightReps: bestWeightReps || null,
      bestWeightDate,
      estimatedOneRm: oneRm > 0 ? Math.round(oneRm * 100) / 100 : null,
      volume: Math.round(volume * 100) / 100,
    });
  }
  return out.sort((a, b) => (b.estimatedOneRm ?? 0) - (a.estimatedOneRm ?? 0));
}

export async function getRecords(userId: string, exerciseId: string) {
  const [ex, settings] = await Promise.all([
    db.exercise.findFirst({ where: { id: exerciseId, userId } }),
    db.userSettings.findUnique({ where: { userId } }),
  ]);
  if (!ex) throw notFound("Exercise not found");
  const repLimit = settings?.estOneRmRepLimit ?? 10;
  const prs = await db.personalRecord.findMany({ where: { exerciseId } });
  const sets = await allSetsForExercise(userId, exerciseId);
  return mapRecords(
    exerciseId,
    prs,
    sets.map((s) => ({ ...s, createdAt: s.date })),
    repLimit,
  );
}

export async function recalculatePRs(userId: string, exerciseId?: string) {
  const exerciseIds = exerciseId
    ? [exerciseId]
    : (await db.exercise.findMany({ where: { userId }, select: { id: true } })).map((e) => e.id);
  await db.$transaction(async (tx) => {
    for (const id of exerciseIds) await recomputePRs(tx, userId, id);
  });
  return { ok: true, recalculated: exerciseIds.length };
}

// ---------- graphs ----------

export async function getGraph(
  userId: string,
  exerciseId: string,
  opts: { metric: string; reps?: number; rm?: number; from?: string; to?: string },
): Promise<{ exerciseId: string; metric: string; points: GraphPointDTO[] }> {
  const ex = await db.exercise.findFirst({ where: { id: exerciseId, userId } });
  if (!ex) throw notFound("Exercise not found");
  const settings = await db.userSettings.findUnique({ where: { userId } });
  const repLimit = settings?.estOneRmRepLimit ?? 10;
  let sets = await allSetsForExercise(userId, exerciseId);
  if (opts.from) sets = sets.filter((s) => s.date >= toDayUtc(opts.from!));
  if (opts.to) sets = sets.filter((s) => s.date <= toDayUtc(opts.to!));

  // group by date
  const byDate = new Map<string, SetLike[]>();
  for (const s of sets) {
    const k = dayKey(s.date);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(s);
  }

  const points: GraphPointDTO[] = [];
  for (const [k, daySets] of byDate) {
    let value: number | null = null;
    switch (opts.metric) {
      case "EST_1RM": {
        value = Math.max(0, ...daySets.filter((s) => s.weight != null && s.reps != null && s.reps >= 1 && s.reps <= repLimit).map((s) => estOneRm(s.weight!, s.reps!)));
        break;
      }
      case "MAX_WEIGHT":
        value = Math.max(0, ...daySets.map((s) => s.weight ?? 0));
        break;
      case "VOLUME":
        value = totalVolume(daySets);
        break;
      case "TOTAL_REPS":
        value = totalReps(daySets);
        break;
      case "MAX_REPS":
        value = Math.max(0, ...daySets.map((s) => s.reps ?? 0));
        break;
      case "WEIGHT_FOR_REPS": {
        const reps = opts.reps ?? 5;
        const exact = daySets.filter((s) => s.reps === reps && s.weight != null);
        if (exact.length) value = Math.max(...exact.map((s) => s.weight!));
        else {
          // heaviest set with ≥ reps
          const heavier = daySets.filter((s) => (s.reps ?? 0) >= reps && s.weight != null);
          value = heavier.length ? Math.max(...heavier.map((s) => s.weight!)) : null;
        }
        break;
      }
      case "REP_MAXES": {
        const rm = opts.rm ?? 1;
        const oneRm = Math.max(0, ...daySets.filter((s) => s.weight != null && s.reps != null && s.reps >= 1 && s.reps <= repLimit).map((s) => estOneRm(s.weight!, s.reps!)));
        value = oneRm > 0 ? estRm(oneRm, rm) : null;
        break;
      }
      case "MAX_DISTANCE":
        value = Math.max(0, ...daySets.map((s) => s.distance ?? 0));
        break;
      case "MAX_TIME":
        value = Math.max(0, ...daySets.map((s) => s.timeSec ?? 0));
        break;
      case "MAX_SPEED": {
        const sp = daySets.filter((s) => s.distance && s.timeSec).map((s) => speed(s.distance!, s.timeSec!));
        value = sp.length ? Math.max(...sp) : null;
        break;
      }
      case "MAX_PACE": {
        const pc = daySets.filter((s) => s.distance && s.timeSec).map((s) => paceSec(s.distance!, s.timeSec!));
        value = pc.length ? Math.min(...pc) : null; // lower pace = faster
        break;
      }
      default:
        value = null;
    }
    if (value != null && value > 0) points.push({ date: k, value: Math.round(value * 100) / 100 });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return { exerciseId, metric: opts.metric, points };
}

// ---------- stats ----------

export async function getStats(userId: string, opts: { period: string; from?: string; to?: string }) {
  let from: Date | null = null;
  let to: Date | null = null;
  const today = todayDayUtc();
  switch (opts.period) {
    case "week":
      from = addDays(today, -6);
      break;
    case "month":
      from = addDays(today, -29);
      break;
    case "year":
      from = addDays(today, -364);
      break;
    case "custom":
      from = opts.from ? toDayUtc(opts.from) : null;
      to = opts.to ? toDayUtc(opts.to) : null;
      break;
    case "all":
    default:
      break;
  }
  const where = {
    userId,
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const workouts = await db.workout.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      exercises: {
        include: {
          exercise: { include: { category: true } },
          sets: true,
        },
      },
    },
  });

  let volume = 0;
  let setCount = 0;
  let reps = 0;
  let durationSec = 0;
  let distance = 0;
  let maxWeight: { value: number; date: string; exerciseName: string } | null = null;
  let maxVolumeDay: { value: number; date: string } | null = null;
  const perExercise = new Map<
    string,
    { exerciseId: string; name: string; categoryColour?: string; setCount: number; volume: number; reps: number }
  >();

  for (const w of workouts) {
    let dayVolume = 0;
    if (w.startAt && w.endAt) durationSec += Math.max(0, (w.endAt.getTime() - w.startAt.getTime()) / 1000);
    for (const we of w.exercises) {
      let exVolume = 0;
      let exReps = 0;
      for (const s of we.sets) {
        setCount++;
        const v = (s.weight ?? 0) * (s.reps ?? 0);
        volume += v;
        dayVolume += v;
        exVolume += v;
        reps += s.reps ?? 0;
        exReps += s.reps ?? 0;
        distance += s.distance ?? 0;
        if (s.weight != null && (!maxWeight || s.weight > maxWeight.value)) {
          maxWeight = { value: s.weight, date: w.date.toISOString(), exerciseName: we.exercise.name };
        }
      }
      const cur = perExercise.get(we.exerciseId) ?? {
        exerciseId: we.exerciseId,
        name: we.exercise.name,
        categoryColour: we.exercise.category?.colour,
        setCount: 0,
        volume: 0,
        reps: 0,
      };
      cur.setCount += we.sets.length;
      cur.volume += exVolume;
      cur.reps += exReps;
      perExercise.set(we.exerciseId, cur);
    }
    if (dayVolume > 0 && (!maxVolumeDay || dayVolume > maxVolumeDay.value)) {
      maxVolumeDay = { value: dayVolume, date: w.date.toISOString() };
    }
  }

  return {
    period: opts.period,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    workouts: workouts.length,
    setCount,
    volume: Math.round(volume * 100) / 100,
    reps,
    durationSec: Math.round(durationSec),
    distance: Math.round(distance * 100) / 100,
    maxWeight,
    maxVolumeDay,
    perExercise: [...perExercise.values()].sort((a, b) => b.volume - a.volume),
    workoutDates: workouts.map((w) => dayKey(w.date)),
  };
}

// ---------- goals ----------

function goalTarget(g: { type: string; targetWeight: number | null; targetReps: number | null; targetDistance: number | null; targetTimeSec: number | null }): number {
  switch (g.type) {
    case "MAX_WEIGHT":
    case "ONE_RM":
      return g.targetWeight ?? 0;
    case "MAX_REPS":
      return g.targetReps ?? 0;
    case "MAX_DISTANCE":
      return g.targetDistance ?? 0;
    case "MAX_TIME":
      return g.targetTimeSec ?? 0;
    case "VOLUME":
      return g.targetWeight ?? 0;
    default:
      return 0;
  }
}

async function goalCurrent(userId: string, goal: { exerciseId: string; type: string }): Promise<number> {
  const sets = await allSetsForExercise(userId, goal.exerciseId);
  if (sets.length === 0) return 0;
  switch (goal.type) {
    case "ONE_RM":
      return Math.round(Math.max(0, ...sets.filter((s) => s.weight && s.reps).map((s) => estOneRm(s.weight!, s.reps!))) * 100) / 100;
    case "MAX_WEIGHT":
      return Math.max(0, ...sets.map((s) => s.weight ?? 0));
    case "MAX_REPS":
      return Math.max(0, ...sets.map((s) => s.reps ?? 0));
    case "MAX_DISTANCE":
      return Math.max(0, ...sets.map((s) => s.distance ?? 0));
    case "MAX_TIME":
      return Math.max(0, ...sets.map((s) => s.timeSec ?? 0));
    case "VOLUME":
      return Math.round(totalVolume(sets) * 100) / 100;
    default:
      return 0;
  }
}

export async function listGoals(userId: string) {
  const goals = await db.goal.findMany({
    where: { userId },
    include: { exercise: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const out = [];
  for (const g of goals) {
    const dto = mapGoal(g);
    const target = goalTarget(g);
    const current = await goalCurrent(userId, g);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    out.push({ ...dto, current, target, pct, achieved: target > 0 && current >= target });
  }
  return out;
}

export async function createGoal(
  userId: string,
  input: { exerciseId: string; type: string; targetWeight?: number | null; targetReps?: number | null; targetDistance?: number | null; targetTimeSec?: number | null },
) {
  const ex = await db.exercise.findFirst({ where: { id: input.exerciseId, userId } });
  if (!ex) throw badRequest("Exercise not found");
  const created = await db.goal.create({
    data: {
      id: uuid7(),
      userId,
      exerciseId: input.exerciseId,
      type: input.type,
      targetWeight: input.targetWeight ?? null,
      targetReps: input.targetReps ?? null,
      targetDistance: input.targetDistance ?? null,
      targetTimeSec: input.targetTimeSec ?? null,
    },
    include: { exercise: { select: { id: true, name: true } } },
  });
  return mapGoal(created);
}

export async function updateGoal(
  userId: string,
  id: string,
  patch: { type?: string; targetWeight?: number | null; targetReps?: number | null; targetDistance?: number | null; targetTimeSec?: number | null },
) {
  const g = await db.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound("Goal not found");
  const updated = await db.goal.update({
    where: { id },
    data: {
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.targetWeight !== undefined ? { targetWeight: patch.targetWeight } : {}),
      ...(patch.targetReps !== undefined ? { targetReps: patch.targetReps } : {}),
      ...(patch.targetDistance !== undefined ? { targetDistance: patch.targetDistance } : {}),
      ...(patch.targetTimeSec !== undefined ? { targetTimeSec: patch.targetTimeSec } : {}),
    },
    include: { exercise: { select: { id: true, name: true } } },
  });
  return mapGoal(updated);
}

export async function deleteGoal(userId: string, id: string) {
  const g = await db.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound("Goal not found");
  await db.goal.delete({ where: { id } });
  return { ok: true };
}
