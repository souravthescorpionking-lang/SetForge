// Exercise + category catalogue service.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { mapExercise, mapCategory } from "../mappers";
import { badRequest, notFound, conflict } from "../http";
import { kgToLbs, lbsToKg } from "@/lib/formulas";

// ---------- categories ----------

export async function listCategories(userId: string) {
  const cats = await db.category.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { exercises: true } } },
  });
  return cats.map((c) => mapCategory(c, c._count.exercises));
}

export async function createCategory(userId: string, input: { name: string; colour?: string }) {
  const name = input.name.trim();
  const existing = await db.category.findFirst({ where: { userId, name } });
  if (existing) throw conflict("A category with this name already exists");
  const count = await db.category.count({ where: { userId } });
  const created = await db.category.create({
    data: { id: uuid7(), userId, name, colour: input.colour ?? "#f97316", sortOrder: count },
  });
  return mapCategory(created);
}

export async function updateCategory(userId: string, id: string, patch: { name?: string; colour?: string; sortOrder?: number }) {
  const cat = await db.category.findFirst({ where: { id, userId } });
  if (!cat) throw notFound("Category not found");
  if (patch.name && patch.name !== cat.name) {
    const clash = await db.category.findFirst({ where: { userId, name: patch.name.trim(), NOT: { id } } });
    if (clash) throw conflict("A category with this name already exists");
  }
  const updated = await db.category.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.colour !== undefined ? { colour: patch.colour } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  return mapCategory(updated);
}

export async function deleteCategory(userId: string, id: string) {
  const cat = await db.category.findFirst({ where: { id, userId }, include: { _count: { select: { exercises: true } } } });
  if (!cat) throw notFound("Category not found");
  if (cat._count.exercises > 0) {
    throw conflict(`Cannot delete — ${cat._count.exercises} exercise(s) still use this category`);
  }
  await db.category.delete({ where: { id } });
  return { ok: true };
}

export async function reorderCategories(userId: string, ids: string[]) {
  await db.$transaction(
    ids.map((id, i) => db.category.updateMany({ where: { id, userId }, data: { sortOrder: i } })),
  );
  return { ok: true };
}

// ---------- exercises ----------

export async function listExercises(
  userId: string,
  opts: { search?: string; categoryId?: string; favoritesOnly?: boolean } = {},
) {
  const where = {
    userId,
    deletedAt: null,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.favoritesOnly ? { isFavorite: true } : {}),
  };
  let rows = await db.exercise.findMany({ where, include: { category: true }, orderBy: { name: "asc" } });

  if (opts.search) {
    const tokens = opts.search.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((e) => {
      const hay = `${e.name} ${e.category?.name ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  // usage stats
  const usage = await db.workoutExercise.groupBy({
    by: ["exerciseId"],
    where: { userId },
    _count: { _all: true },
  });
  const lastUsed = await db.workoutExercise.findMany({
    where: { userId },
    select: { exerciseId: true, workout: { select: { date: true } } },
    orderBy: { workout: { date: "desc" } },
  });
  const lastByEx = new Map<string, Date>();
  for (const lu of lastUsed) {
    if (!lastByEx.has(lu.exerciseId)) lastByEx.set(lu.exerciseId, lu.workout.date);
  }
  const countByEx = new Map(usage.map((u) => [u.exerciseId, u._count._all]));

  return rows.map((e) =>
    mapExercise(e, {
      workoutCount: countByEx.get(e.id) ?? 0,
      lastPerformed: lastByEx.get(e.id)?.toISOString() ?? null,
    }),
  );
}

export async function getExercise(userId: string, id: string) {
  const e = await db.exercise.findFirst({ where: { id, userId, deletedAt: null }, include: { category: true } });
  if (!e) throw notFound("Exercise not found");
  return mapExercise(e);
}

export async function createExercise(
  userId: string,
  input: {
    name: string;
    categoryId: string;
    type?: string;
    notes?: string | null;
    weightUnit?: string | null;
    weightIncrement?: number | null;
    restSec?: number | null;
    defaultGraph?: string | null;
    barWeight?: number | null;
    autoWarmup?: boolean;
    // ---- Part 2 ----
    defaultSetType?: string | null;
    defaultRpeTarget?: number | null;
    defaultTempo?: string | null;
  },
) {
  const cat = await db.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!cat) throw badRequest("Category not found");
  const name = input.name.trim();
  const clash = await db.exercise.findFirst({ where: { userId, name } });
  if (clash) throw conflict("An exercise with this name already exists");
  const created = await db.exercise.create({
    data: {
      id: uuid7(),
      userId,
      categoryId: input.categoryId,
      name,
      notes: input.notes ?? null,
      type: input.type ?? "WEIGHT_REPS",
      weightUnit: input.weightUnit ?? null,
      weightIncrement: input.weightIncrement ?? null,
      restSec: input.restSec ?? null,
      defaultGraph: input.defaultGraph ?? null,
      barWeight: input.barWeight ?? null,
      autoWarmup: input.autoWarmup ?? false,
      defaultSetType: input.defaultSetType ?? null,
      defaultRpeTarget: input.defaultRpeTarget ?? null,
      defaultTempo: input.defaultTempo ?? null,
    },
    include: { category: true },
  });
  return mapExercise(created);
}

export async function updateExercise(
  userId: string,
  id: string,
  patch: {
    name?: string;
    categoryId?: string;
    type?: string;
    notes?: string | null;
    weightUnit?: string | null;
    weightIncrement?: number | null;
    restSec?: number | null;
    defaultGraph?: string | null;
    barWeight?: number | null;
    autoWarmup?: boolean;
    isFavorite?: boolean;
    unitChangeMode?: "convert" | "change";
    // ---- Part 2 ----
    defaultSetType?: string | null;
    defaultRpeTarget?: number | null;
    defaultTempo?: string | null;
  },
) {
  const ex = await db.exercise.findFirst({ where: { id, userId, deletedAt: null } });
  if (!ex) throw notFound("Exercise not found");
  if (patch.name && patch.name.trim() !== ex.name) {
    const clash = await db.exercise.findFirst({ where: { userId, name: patch.name.trim(), NOT: { id } } });
    if (clash) throw conflict("An exercise with this name already exists");
  }
  if (patch.categoryId) {
    const cat = await db.category.findFirst({ where: { id: patch.categoryId, userId } });
    if (!cat) throw badRequest("Category not found");
  }

  // Type change: keep overlapping fields (handled naturally — DB keeps values; UI warns).
  // Unit change: optionally convert existing set weights + PRs.
  if (patch.weightUnit !== undefined && patch.weightUnit !== ex.weightUnit && patch.unitChangeMode === "convert") {
    const toLbs = patch.weightUnit === "lbs";
    await db.$transaction(async (tx) => {
      const wes = await tx.workoutExercise.findMany({ where: { userId, exerciseId: id }, select: { id: true } });
      for (const we of wes) {
        const sets = await tx.trainingSet.findMany({ where: { workoutExerciseId: we.id, weight: { not: null } } });
        for (const s of sets) {
          const w = toLbs ? kgToLbs(s.weight!) : lbsToKg(s.weight!);
          await tx.trainingSet.update({ where: { id: s.id }, data: { weight: Math.round(w * 1000) / 1000 } });
        }
      }
      await tx.personalRecord.updateMany({
        where: { exerciseId: id },
        data: {}, // weights recomputed below via full recompute
      });
      // recompute PRs from converted sets
      const { recomputePRs } = await import("./workout-service");
      await recomputePRs(tx, userId, id);
    });
  }

  const updated = await db.exercise.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.weightUnit !== undefined ? { weightUnit: patch.weightUnit } : {}),
      ...(patch.weightIncrement !== undefined ? { weightIncrement: patch.weightIncrement } : {}),
      ...(patch.restSec !== undefined ? { restSec: patch.restSec } : {}),
      ...(patch.defaultGraph !== undefined ? { defaultGraph: patch.defaultGraph } : {}),
      ...(patch.barWeight !== undefined ? { barWeight: patch.barWeight } : {}),
      ...(patch.autoWarmup !== undefined ? { autoWarmup: patch.autoWarmup } : {}),
      ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
      ...(patch.defaultSetType !== undefined ? { defaultSetType: patch.defaultSetType } : {}),
      ...(patch.defaultRpeTarget !== undefined ? { defaultRpeTarget: patch.defaultRpeTarget } : {}),
      ...(patch.defaultTempo !== undefined ? { defaultTempo: patch.defaultTempo } : {}),
    },
    include: { category: true },
  });
  return mapExercise(updated);
}

export async function deleteExercise(userId: string, id: string) {
  const ex = await db.exercise.findFirst({ where: { id, userId, deletedAt: null } });
  if (!ex) throw notFound("Exercise not found");
  await db.exercise.delete({ where: { id } }); // cascades history/PRs/goals/routine refs
  return { ok: true };
}

/** History: sets grouped by workout date, newest first. */
export async function exerciseHistory(userId: string, exerciseId: string, limit = 100) {
  const ex = await db.exercise.findFirst({ where: { id: exerciseId, userId } });
  if (!ex) throw notFound("Exercise not found");
  const wes = await db.workoutExercise.findMany({
    where: { userId, exerciseId },
    include: {
      workout: true,
      sets: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { workout: { date: "desc" } },
    take: limit,
  });
  return wes.map((we) => ({
    workoutId: we.workoutId,
    date: we.workout.date.toISOString(),
    workoutExerciseId: we.id,
    sets: we.sets.map((s) => ({
      id: s.id,
      weight: s.weight ?? null,
      reps: s.reps ?? null,
      distance: s.distance ?? null,
      timeSec: s.timeSec ?? null,
      comment: s.comment ?? null,
      isComplete: s.isComplete,
      sortOrder: s.sortOrder,
      workoutExerciseId: s.workoutExerciseId,
    })),
  }));
}

/** Sets from the most recent workout containing this exercise (for prefill). */
export async function lastSetsForExercise(userId: string, exerciseId: string, beforeDate?: string) {
  const we = await db.workoutExercise.findFirst({
    where: {
      userId,
      exerciseId,
      ...(beforeDate ? { workout: { date: { lt: new Date(beforeDate) } } } : {}),
    },
    include: {
      workout: true,
      sets: { where: { isWarmup: false }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { workout: { date: "desc" } },
  });
  if (!we) return { date: null, sets: [] };
  return {
    date: we.workout.date.toISOString(),
    sets: we.sets.map((s) => ({
      id: s.id,
      weight: s.weight ?? null,
      reps: s.reps ?? null,
      distance: s.distance ?? null,
      timeSec: s.timeSec ?? null,
      comment: s.comment ?? null,
      isComplete: s.isComplete,
      isWarmup: s.isWarmup,
      sortOrder: s.sortOrder,
      workoutExerciseId: s.workoutExerciseId,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — weight-history table (§4.12). Per-exercise set-index × date grid.
// ─────────────────────────────────────────────────────────────────────────────

import { dayKey as weightTableDayKey } from "@/lib/dates";
import type { WeightTableDTO } from "@/lib/types";

export async function getWeightTable(
  userId: string,
  exerciseId: string,
  opts: { limit: number; before?: string },
): Promise<WeightTableDTO> {
  const exercise = await db.exercise.findFirst({ where: { id: exerciseId, userId, deletedAt: null } });
  if (!exercise) throw notFound("Exercise not found");

  const beforeDate = opts.before ? new Date(`${opts.before}T00:00:00.000Z`) : new Date();
  // Fetch recent workouts containing this exercise (newest first), take limit+1 to detect hasMore.
  const workouts = await db.workout.findMany({
    where: {
      userId,
      removedAt: null,
      date: { lte: beforeDate },
      exercises: { some: { exerciseId } },
    },
    orderBy: { date: "desc" },
    take: opts.limit + 1,
    include: { exercises: { where: { exerciseId }, include: { sets: { orderBy: { sortOrder: "asc" } } } } },
  });

  const hasMore = workouts.length > opts.limit;
  const page = hasMore ? workouts.slice(0, opts.limit) : workouts;
  const columns = page.map((w) => ({ date: weightTableDayKey(w.date), label: weightTableDayKey(w.date) }));

  // Per-date set lists (performed, in order)
  const perDate: Array<Array<{ weight: number | null; reps: number | null }>> = page.map((w) => {
    const sets = w.exercises[0]?.sets ?? [];
    return sets.map((s) => ({ weight: s.weight ?? null, reps: s.reps ?? null }));
  });
  const maxIndex = perDate.reduce((m, list) => Math.max(m, list.length), 0);

  const rows: WeightTableDTO["rows"] = [];
  for (let i = 0; i < maxIndex; i++) {
    const cells = perDate.map((list, dateIdx) => {
      const s = list[i];
      if (!s || (s.weight == null && s.reps == null)) return null;
      return { date: columns[dateIdx].date, weight: s.weight, reps: s.reps, isBest: false };
    });
    // best in row: max weight (tie → more reps)
    let bestIdx = -1;
    cells.forEach((c, idx) => {
      if (!c) return;
      if (bestIdx < 0) { bestIdx = idx; return; }
      const best = cells[bestIdx]!;
      if ((c.weight ?? 0) > (best.weight ?? 0) || (c.weight === best.weight && (c.reps ?? 0) > (best.reps ?? 0))) bestIdx = idx;
    });
    if (bestIdx >= 0 && cells[bestIdx]) cells[bestIdx]!.isBest = true;
    rows.push({ setIndex: i + 1, cells });
  }

  return { exerciseId, columns, rows, hasMore };
}
