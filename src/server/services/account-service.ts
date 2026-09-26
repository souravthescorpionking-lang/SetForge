// Account: data export (JSON backup), import (restore/merge), CSV, password, delete.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { toDayUtc } from "@/lib/dates";
import { badRequest, notFound } from "../http";
import { recomputePRs } from "./workout-service";
import { z } from "zod";
import type { BackupDTO } from "@/lib/types";

// ---------- export ----------

export async function exportBackup(userId: string): Promise<BackupDTO> {
  const [user, settings, categories, exercises, workouts, routines, measurements, plates, goals] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.userSettings.findUnique({ where: { userId } }),
    db.category.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
    db.exercise.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.workout.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      include: {
        groups: true,
        exercises: {
          orderBy: { sortOrder: "asc" },
          include: { exercise: true, sets: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    db.routine.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
      include: {
        days: {
          orderBy: { sortOrder: "asc" },
          include: { exercises: { orderBy: { sortOrder: "asc" }, include: { exercise: true, sets: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
    }),
    db.measurement.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
      include: { unit: true, records: { orderBy: { recordedAt: "asc" } } },
    }),
    db.plate.findMany({ where: { userId }, orderBy: [{ unitSystem: "asc" }, { sortOrder: "asc" }] }),
    db.goal.findMany({ where: { userId }, include: { exercise: true } }),
  ]);
  if (!user || !settings) throw notFound("User not found");

  return {
    app: "SetForge",
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { email: user.email, name: user.name },
    settings: {
      theme: settings.theme,
      unitSystem: settings.unitSystem,
      weekStart: settings.weekStart,
      defaultWeightIncrement: settings.defaultWeightIncrement,
      homeSetsShown: settings.homeSetsShown,
      showCategory: settings.showCategory,
      trackPR: settings.trackPR,
      markSetsComplete: settings.markSetsComplete,
      autoSelectNextSet: settings.autoSelectNextSet,
      keepScreenOn: settings.keepScreenOn,
      estOneRmRepLimit: settings.estOneRmRepLimit,
      weeklyWorkoutTarget: settings.weeklyWorkoutTarget,
      showSetType: settings.showSetType,
      showRpe: settings.showRpe,
      showTempo: settings.showTempo,
      showRest: settings.showRest,
      autoRestFromRow: settings.autoRestFromRow,
      restEndBehaviour: settings.restEndBehaviour,
      e1rmMethod: settings.e1rmMethod,
    },
    categories: categories.map((c) => ({ id: c.id, name: c.name, colour: c.colour, sortOrder: c.sortOrder })),
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      categoryId: e.categoryId,
      category: null,
      notes: e.notes,
      type: e.type,
      weightUnit: e.weightUnit,
      weightIncrement: e.weightIncrement,
      restSec: e.restSec,
      defaultGraph: e.defaultGraph,
      isFavorite: e.isFavorite,
      barWeight: e.barWeight,
      autoWarmup: e.autoWarmup,
      defaultSetType: e.defaultSetType ?? null,
      defaultRpeTarget: e.defaultRpeTarget ?? null,
      defaultTempo: e.defaultTempo ?? null,
    })),
    workouts: workouts.map((w) => {
      const groupById = new Map(w.groups.map((g) => [g.id, g.name]));
      return {
        date: w.date.toISOString(),
        comment: w.comment ?? null,
        startAt: w.startAt?.toISOString() ?? null,
        endAt: w.endAt?.toISOString() ?? null,
        groups: w.groups.map((g) => ({ id: g.id, name: g.name, colour: g.colour })),
        exercises: w.exercises.map((we) => ({
          exerciseName: we.exercise.name,
          sortOrder: we.sortOrder,
          groupName: we.groupId ? groupById.get(we.groupId) ?? null : null,
          sets: we.sets.map((s) => ({
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            distance: s.distance ?? null,
            timeSec: s.timeSec ?? null,
            comment: s.comment ?? null,
            isComplete: s.isComplete,
            isWarmup: s.isWarmup,
            sortOrder: s.sortOrder,
            // ---- Part 2 ----
            setType: s.setType ?? "NORMAL",
            rpe: s.rpe ?? null,
            tempo: s.tempo ?? null,
            restPlannedSec: s.restPlannedSec ?? null,
            restActualSec: s.restActualSec ?? null,
            completedAt: s.completedAt?.toISOString() ?? null,
          })),
        })),
      };
    }),
    routines: routines.map((r) => ({
      name: r.name,
      notes: r.notes ?? null,
      sortOrder: r.sortOrder,
      days: r.days.map((d) => ({
        name: d.name,
        sortOrder: d.sortOrder,
        groups: [],
        exercises: d.exercises.map((re) => ({
          exerciseName: re.exercise.name,
          sortOrder: re.sortOrder,
          groupName: null,
          sets: re.sets.map((s) => ({
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            distance: s.distance ?? null,
            timeSec: s.timeSec ?? null,
            sortOrder: s.sortOrder,
            // ---- Part 2 ----
            setType: s.setType ?? null,
            rpe: s.rpe ?? null,
            tempo: s.tempo ?? null,
            restPlannedSec: s.restPlannedSec ?? null,
          })),
        })),
      })),
    })),
    measurements: measurements.map((m) => ({
      name: m.name,
      unitName: m.unit.name,
      goalType: m.goalType,
      targetValue: m.targetValue ?? null,
      isEnabled: m.isEnabled,
      isDefault: m.isDefault,
      sortOrder: m.sortOrder,
      records: m.records.map((r) => ({
        value: r.value,
        recordedAt: r.recordedAt.toISOString(),
        comment: r.comment ?? null,
      })),
    })),
    plates: plates.map((p) => ({
      id: p.id,
      weight: p.weight,
      colour: p.colour,
      count: p.count,
      isAvailable: p.isAvailable,
      unitSystem: p.unitSystem,
      sortOrder: p.sortOrder,
    })),
    goals: goals.map((g) => ({
      exerciseName: g.exercise.name,
      type: g.type,
      targetWeight: g.targetWeight ?? null,
      targetReps: g.targetReps ?? null,
      targetDistance: g.targetDistance ?? null,
      targetTimeSec: g.targetTimeSec ?? null,
    })),
  };
}

// ---------- import ----------

const backupSchema = z.object({
  app: z.string(),
  version: z.number(),
  workouts: z.array(
    z.object({
      date: z.string(),
      comment: z.string().nullable().optional(),
      startAt: z.string().nullable().optional(),
      endAt: z.string().nullable().optional(),
      exercises: z.array(
        z.object({
          exerciseName: z.string(),
          sortOrder: z.number().optional(),
          groupName: z.string().nullable().optional(),
          sets: z.array(
            z.object({
              weight: z.number().nullable().optional(),
              reps: z.number().nullable().optional(),
              distance: z.number().nullable().optional(),
              timeSec: z.number().nullable().optional(),
              comment: z.string().nullable().optional(),
              isComplete: z.boolean().optional(),
              isWarmup: z.boolean().optional(),
              sortOrder: z.number().optional(),
              // ---- Part 2 (all optional: old backups import cleanly with nulls) ----
              setType: z.string().nullable().optional(),
              rpe: z.number().nullable().optional(),
              tempo: z.string().nullable().optional(),
              restPlannedSec: z.number().int().nullable().optional(),
              restActualSec: z.number().int().nullable().optional(),
              completedAt: z.string().nullable().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
  measurements: z
    .array(
      z.object({
        name: z.string(),
        unitName: z.string(),
        goalType: z.string().optional(),
        targetValue: z.number().nullable().optional(),
        isEnabled: z.boolean().optional(),
        sortOrder: z.number().optional(),
        records: z.array(z.object({ value: z.number(), recordedAt: z.string(), comment: z.string().nullable().optional() })).optional(),
      }),
    )
    .optional(),
});

const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB

export async function importBackup(userId: string, mode: "replace" | "merge", data: unknown) {
  const size = JSON.stringify(data ?? {}).length;
  if (size > MAX_IMPORT_BYTES) throw badRequest("Import file too large (max 50 MB)");

  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Invalid backup file", parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const backup = parsed.data;

  if (mode === "replace") {
    await db.$transaction(async (tx) => {
      await tx.workout.deleteMany({ where: { userId } });
      await tx.routine.deleteMany({ where: { userId } });
      await tx.measurementRecord.deleteMany({ where: { userId } });
      await tx.measurement.deleteMany({ where: { userId } });
      await tx.goal.deleteMany({ where: { userId } });
    });
  }

  const createdWorkouts: string[] = [];
  const touchedExercises = new Set<string>();

  for (const w of backup.workouts) {
    const date = toDayUtc(w.date);
    const exists = await db.workout.findUnique({ where: { userId_date: { userId, date } } });
    if (exists && mode === "merge") continue; // keep existing day, skip duplicates
    if (exists && mode === "replace") continue; // replaced above; skip

    const workout = await db.workout.create({
      data: {
        id: uuid7(),
        userId,
        date,
        comment: w.comment ?? null,
        startAt: w.startAt ? new Date(w.startAt) : null,
        endAt: w.endAt ? new Date(w.endAt) : null,
      },
    });
    createdWorkouts.push(workout.id);

    const groupIds = new Map<string, string>();
    for (const ex of w.exercises) {
      const exercise = await db.exercise.findFirst({ where: { userId, name: ex.exerciseName } });
      if (!exercise) continue; // unknown exercise in this catalogue — skip
      touchedExercises.add(exercise.id);
      let groupId: string | null = null;
      if (ex.groupName) {
        if (!groupIds.has(ex.groupName)) {
          const g = await db.workoutGroup.create({
            data: { id: uuid7(), userId, workoutId: workout.id, name: ex.groupName },
          });
          groupIds.set(ex.groupName, g.id);
        }
        groupId = groupIds.get(ex.groupName)!;
      }
      const we = await db.workoutExercise.create({
        data: { id: uuid7(), userId, workoutId: workout.id, exerciseId: exercise.id, sortOrder: ex.sortOrder ?? 0, groupId },
      });
      for (const s of ex.sets) {
        const setType = s.setType ?? (s.isWarmup ? "WARMUP" : "NORMAL");
        await db.trainingSet.create({
          data: {
            id: uuid7(),
            userId,
            workoutExerciseId: we.id,
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            distance: s.distance ?? null,
            timeSec: s.timeSec ?? null,
            comment: s.comment ?? null,
            isComplete: s.isComplete ?? false,
            isWarmup: s.isWarmup ?? false,
            setType,
            rpe: s.rpe ?? null,
            tempo: s.tempo ?? null,
            restPlannedSec: s.restPlannedSec ?? null,
            restActualSec: s.restActualSec ?? null,
            completedAt: s.completedAt ? new Date(s.completedAt) : null,
            sortOrder: s.sortOrder ?? 0,
          },
        });
      }
    }
  }

  // measurements (merge by name)
  for (const m of backup.measurements ?? []) {
    const unit = await db.measurementUnit.findFirst({ where: { OR: [{ userId: null, name: m.unitName }, { userId, name: m.unitName }] } });
    if (!unit) continue;
    const existing = await db.measurement.findFirst({ where: { userId, name: m.name } });
    if (existing) {
      for (const r of m.records ?? []) {
        const dup = await db.measurementRecord.findFirst({
          where: { measurementId: existing.id, recordedAt: new Date(r.recordedAt), value: r.value },
        });
        if (!dup) {
          await db.measurementRecord.create({
            data: { id: uuid7(), userId, measurementId: existing.id, value: r.value, recordedAt: new Date(r.recordedAt), comment: r.comment ?? null },
          });
        }
      }
    } else {
      const created = await db.measurement.create({
        data: {
          id: uuid7(),
          userId,
          unitId: unit.id,
          name: m.name,
          goalType: m.goalType ?? "NONE",
          targetValue: m.targetValue ?? null,
          isEnabled: m.isEnabled ?? true,
          sortOrder: m.sortOrder ?? 0,
        },
      });
      for (const r of m.records ?? []) {
        await db.measurementRecord.create({
          data: { id: uuid7(), userId, measurementId: created.id, value: r.value, recordedAt: new Date(r.recordedAt), comment: r.comment ?? null },
        });
      }
    }
  }

  await db.$transaction(async (tx) => {
    for (const exerciseId of touchedExercises) await recomputePRs(tx, userId, exerciseId);
  });

  return { ok: true, importedWorkouts: createdWorkouts.length };
}

// ---------- CSV ----------

export async function exportCsv(userId: string, type: "workouts" | "body"): Promise<string> {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  if (type === "body") {
    const rows = await db.measurement.findMany({
      where: { userId },
      include: { unit: true, records: { orderBy: { recordedAt: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    const lines = ["date,measurement,value,unit,comment"];
    for (const m of rows) {
      for (const r of m.records) {
        lines.push([r.recordedAt.toISOString(), m.name, r.value, m.unit.name, r.comment ?? ""].map(esc).join(","));
      }
    }
    return lines.join("\n");
  }
  const workouts = await db.workout.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    include: {
      exercises: { orderBy: { sortOrder: "asc" }, include: { exercise: true, sets: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  const lines = ["date,exercise,category,set,weight,reps,distance,time_sec,comment"];
  for (const w of workouts) {
    for (const we of w.exercises) {
      we.sets.forEach((s, i) => {
        lines.push(
          [
            w.date.toISOString().slice(0, 10),
            we.exercise.name,
            "",
            i + 1,
            s.weight ?? "",
            s.reps ?? "",
            s.distance ?? "",
            s.timeSec ?? "",
            s.comment ?? "",
          ]
            .map(esc)
            .join(","),
        );
      });
    }
  }
  return lines.join("\n");
}

// ---------- history deletion ----------

export async function deleteWorkoutHistory(
  userId: string,
  opts: { mode: "all" | "range" | "exercise"; from?: string; to?: string; exerciseId?: string },
) {
  let workoutIds: string[] = [];
  if (opts.mode === "all") {
    workoutIds = (await db.workout.findMany({ where: { userId }, select: { id: true } })).map((w) => w.id);
    await db.workout.deleteMany({ where: { userId } });
  } else if (opts.mode === "range") {
    if (!opts.from || !opts.to) throw badRequest("Range deletion requires from and to dates");
    const where = { userId, date: { gte: toDayUtc(opts.from), lte: toDayUtc(opts.to) } };
    workoutIds = (await db.workout.findMany({ where, select: { id: true } })).map((w) => w.id);
    await db.workout.deleteMany({ where });
  } else if (opts.mode === "exercise") {
    if (!opts.exerciseId) throw badRequest("Exercise deletion requires exerciseId");
    const ex = await db.exercise.findFirst({ where: { id: opts.exerciseId, userId } });
    if (!ex) throw notFound("Exercise not found");
    const wes = await db.workoutExercise.findMany({
      where: { userId, exerciseId: opts.exerciseId },
      select: { workoutId: true },
    });
    const candidateIds = [...new Set(wes.map((w) => w.workoutId))];
    await db.workoutExercise.deleteMany({ where: { userId, exerciseId: opts.exerciseId } });
    // remove now-empty workouts
    for (const wid of candidateIds) {
      const remaining = await db.workoutExercise.count({ where: { workoutId: wid } });
      const groupCount = await db.workoutGroup.count({ where: { workoutId: wid } });
      if (remaining === 0) {
        if (groupCount > 0) await db.workoutGroup.deleteMany({ where: { workoutId: wid } });
        await db.workout.delete({ where: { id: wid } }).catch(() => undefined);
        workoutIds.push(wid);
      }
    }
  }
  // full PR recompute
  const exerciseIds = (await db.exercise.findMany({ where: { userId }, select: { id: true } })).map((e) => e.id);
  await db.$transaction(async (tx) => {
    for (const exerciseId of exerciseIds) await recomputePRs(tx, userId, exerciseId);
  });
  return { ok: true, deletedWorkouts: workoutIds.length };
}
