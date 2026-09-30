// ─────────────────────────────────────────────────────────────────────────────
// Day service — Part 9 §5 Day Overview cluster (§5.1 rearrange, §5.2 replace,
// §5.3 info, §5.4 notes) + §4 PhaseOverride order.
//
// Vocabulary mapping (spec → repo):
//   Day            = RoutineDay (user-owned row — owner scope is day.userId)
//   Series         = RoutineGroup (code/label derived, never user-edited)
//   SeriesExercise = RoutineExercise (tip, restNone)
//   PrescribedSet  = PredefinedSet (isAmrap)
//   Override       = DayOverride (seriesOrder string[][] · replacements · notes)
//
// The §5 merge (getDayDetail): the day's EFFECTIVE exercise list order =
// override.seriesOrder when present, else template sortOrder; grouping is
// recomputed from the resulting order (override sub-arrays ARE the series —
// moving an exercise into another series changes its group; empty series are
// dropped; template grouping buckets by groupId at first-member position, the
// same semantics deriveGroups uses). Replacements swap the exerciseId → the
// replacement exercise's data while KEEPING the original SeriesExercise's
// prescribed sets. Notes attach per SeriesExercise id.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { badRequest, notFound } from "../http";
import { jsonStringArray } from "../media";
import { mapExercise, mapRoutineExercise } from "../mappers";
import { deriveGroups, groupLabelForSize } from "@/lib/grouping";
import { effectiveVariantDays, markDayOff, unmarkDayOff } from "./program-service";
import { clampCursor } from "./program-rules";
import { Prisma, type RoutineDay } from "@prisma/client";
import type {
  DayDetailDTO,
  DayExerciseDTO,
  DaySeriesDTO,
  ExerciseSuggestionDTO,
} from "@/lib/types";

// ---------- includes ----------

const dayDetailInclude = {
  routine: true,
  phase: true,
  exercises: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      exercise: { include: { category: true } },
      sets: { orderBy: { sortOrder: "asc" as const } },
    },
  },
} satisfies Prisma.RoutineDayInclude;

type DayDetailRow = RoutineDay & Prisma.RoutineDayGetPayload<{ include: typeof dayDetailInclude }>;

/** Variant-aware routine include (cursor day resolution for isCurrentProgramDay). */
const routineForCursorInclude = {
  days: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      exercises: { include: { exercise: { include: { category: true } }, sets: true } },
    },
  },
  variants: { include: { phases: { orderBy: { idx: "asc" as const } } } },
} satisfies Prisma.RoutineInclude;

// ---------- override payload parsing ----------

type OverridePayload = {
  seriesOrder: string[][] | null;
  replacements: Record<string, string>;
  notes: Record<string, string>;
};

function parseJsonRecord(raw: unknown): Record<string, string> {
  if (raw == null) return {};
  const obj = Array.isArray(raw) ? null : (() => {
    try {
      return JSON.parse(String(raw)) as unknown;
    } catch {
      return null;
    }
  })();
  if (obj == null || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseSeriesOrder(raw: unknown): string[][] | null {
  if (raw == null) return null;
  const arr = Array.isArray(raw) ? raw : (() => {
    try {
      return JSON.parse(String(raw)) as unknown;
    } catch {
      return null;
    }
  })();
  if (!Array.isArray(arr)) return null;
  const out: string[][] = [];
  for (const sub of arr) {
    if (!Array.isArray(sub)) continue;
    const ids = sub.filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length > 0) out.push(ids);
  }
  return out;
}

function parseOverride(row: { seriesOrder: unknown; replacements: unknown; notes: unknown } | null): OverridePayload {
  return {
    seriesOrder: parseSeriesOrder(row?.seriesOrder),
    replacements: parseJsonRecord(row?.replacements),
    notes: parseJsonRecord(row?.notes),
  };
}

// ---------- series derivation ----------

/** Template series: deriveGroups semantics — grouped members bucket by groupId
 *  (position = first member), ungrouped exercises are their own series of 1. */
function templateSeriesIds(day: DayDetailRow): string[][] {
  const groups = deriveGroups(
    day.exercises.map((re) => ({ id: re.id, groupId: re.groupId ?? null, sortOrder: re.sortOrder })),
  );
  return groups.map((g) => g.members.map((m) => m.id));
}

/** Effective series from the override order: sub-arrays ARE the series; day
 *  members missing from the override (added later) append in template order,
 *  grouped by template contiguity; unknown ids are dropped. */
function overrideSeriesIds(day: DayDetailRow, seriesOrder: string[][]): string[][] {
  const known = new Set(day.exercises.map((re) => re.id));
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const sub of seriesOrder) {
    const ids = sub.filter((id) => known.has(id) && !seen.has(id));
    if (ids.length === 0) continue;
    for (const id of ids) seen.add(id);
    out.push(ids);
  }
  const rest = day.exercises.filter((re) => !seen.has(re.id));
  if (rest.length > 0) {
    // Group the remainder by template contiguity (same rule as the template
    // path): runs of the same groupId, singletons standalone.
    let current: string[] = [];
    let currentGroup: string | null | undefined = undefined;
    for (const re of rest) {
      const g = re.groupId ?? null;
      if (currentGroup === undefined) {
        currentGroup = g;
        current = [re.id];
      } else if (g !== null && g === currentGroup) {
        current.push(re.id);
      } else {
        out.push(current);
        currentGroup = g;
        current = [re.id];
      }
    }
    if (current.length > 0) out.push(current);
  }
  return out;
}

// ---------- §5 GET /api/days/:dayId ----------

export async function getDayDetail(userId: string, dayId: string): Promise<DayDetailDTO> {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId }, include: dayDetailInclude });
  if (!day) throw notFound("Day not found");

  const overrideRow = await db.dayOverride.findUnique({ where: { userId_dayId: { userId, dayId } } });
  const override = parseOverride(overrideRow);
  const favRow = await db.dayFavorite.findUnique({ where: { userId_dayId: { userId, dayId } } });
  const favourite = favRow != null;

  // ---- replacement exercise data (owned + live only) ----
  const replacementIds = [...new Set(Object.values(override.replacements))];
  const replacementRows = replacementIds.length > 0
    ? await db.exercise.findMany({
        where: { userId, deletedAt: null, id: { in: replacementIds } },
        include: { category: true },
      })
    : [];
  const replacementById = new Map(replacementRows.map((e) => [e.id, e]));

  // ---- effective series ----
  const seriesIds = override.seriesOrder ? overrideSeriesIds(day, override.seriesOrder) : templateSeriesIds(day);
  const reById = new Map(day.exercises.map((re) => [re.id, re]));

  const series: DaySeriesDTO[] = seriesIds.map((ids, i) => {
    const exercises: DayExerciseDTO[] = [];
    for (const id of ids) {
      const re = reById.get(id);
      if (!re) continue;
      const replacementId = override.replacements[re.id];
      const replacement = replacementId ? replacementById.get(replacementId) : undefined;
      const base = mapRoutineExercise(re);
      exercises.push({
        ...base,
        // Replaced → the replacement's data (sets KEPT from the template row).
        exerciseId: replacement ? replacement.id : re.exerciseId,
        exercise: replacement ? mapExercise(replacement) : base.exercise,
        note: override.notes[re.id] ?? null,
        replacedExerciseId: replacement ? re.exerciseId : null,
      });
    }
    const code = String.fromCharCode(65 + (i % 26));
    return {
      key: `s:${i}:${ids[0] ?? ""}`,
      code,
      label: groupLabelForSize(exercises.length),
      size: exercises.length,
      exercises,
    };
  });
  const exercises = series.flatMap((s) => s.exercises);
  const setsCount = exercises.reduce((n, e) => n + e.sets.length, 0);

  // ---- merged muscles / equipment (fallback: union over the EFFECTIVE list) ----
  const dayMuscles = jsonStringArray(day.primaryMuscles);
  const primaryMuscles = dayMuscles.length > 0
    ? dayMuscles
    : [...new Set(exercises.flatMap((e) => e.exercise.primaryMuscles ?? []))];
  const dayEquipment = jsonStringArray(day.equipment);
  const equipment = dayEquipment.length > 0
    ? dayEquipment
    : [...new Set(exercises.flatMap((e) => e.exercise.equipment ?? []))];

  // ---- cursor day match (isCurrentProgramDay) ----
  let isCurrentProgramDay = false;
  const active = await db.activeRoutine.findFirst({ where: { userId, routineId: day.routineId } });
  if (active) {
    const routineFull = await db.routine.findFirst({
      where: { id: day.routineId, userId },
      include: routineForCursorInclude,
    });
    if (routineFull) {
      const variantDays = await effectiveVariantDays(
        userId,
        routineFull as Parameters<typeof effectiveVariantDays>[1],
        active.variantId,
      );
      const cursorDay = variantDays[clampCursor(active.cursorDayIndex, variantDays.length)];
      isCurrentProgramDay = cursorDay?.id === day.id;
    }
  }

  return {
    id: day.id,
    routineId: day.routineId,
    name: day.name,
    dayType: day.dayType ?? "WORKOUT",
    sortOrder: day.sortOrder,
    primaryMuscles,
    equipment,
    estMinutes: day.estMinutes ?? day.routine.estMinutes ?? null,
    isFavorite: favourite,
    setsCount,
    exercisesCount: exercises.length,
    routine: {
      id: day.routine.id,
      name: day.routine.name,
      kind: day.routine.kind ?? "ROUTINE",
      tagline: day.routine.tagline ?? null,
      estMinutes: day.routine.estMinutes ?? null,
    },
    phase: day.phase ? { id: day.phase.id, name: day.phase.name, idx: day.phase.idx } : null,
    isCurrentProgramDay,
    series,
    exercises,
    override: overrideRow
      ? {
          seriesOrder: override.seriesOrder,
          replacements: Object.keys(override.replacements).length > 0 ? override.replacements : null,
          notes: Object.keys(override.notes).length > 0 ? override.notes : null,
        }
      : null,
  };
}

// ---------- §5.1/§5.2/§5.4 PUT /api/days/:dayId/override ----------

export type DayOverridePatchInput = {
  seriesOrder?: string[][] | null;
  replacements?: Record<string, string> | null;
  notes?: Record<string, string> | null;
};

export async function putDayOverride(userId: string, dayId: string, patch: DayOverridePatchInput): Promise<{ ok: true }> {
  const day = await db.routineDay.findFirst({
    where: { id: dayId, userId },
    include: { exercises: { select: { id: true } } },
  });
  if (!day) throw notFound("Day not found");
  const reIds = new Set(day.exercises.map((re) => re.id));

  // ---- validation: seriesOrder references this day's SeriesExercises ----
  if (patch.seriesOrder != null) {
    const flat = patch.seriesOrder.flat();
    if (new Set(flat).size !== flat.length) throw badRequest("seriesOrder cannot repeat an exercise");
    for (const id of flat) {
      if (!reIds.has(id)) throw badRequest(`seriesOrder references an exercise outside this day: ${id}`);
    }
  }

  // ---- validation: replacements map day exercises → owned live exercises ----
  let replacementRows: Array<{ id: string }> = [];
  if (patch.replacements != null) {
    const entries = Object.entries(patch.replacements);
    for (const [reId] of entries) {
      if (!reIds.has(reId)) throw badRequest(`replacements key is not an exercise of this day: ${reId}`);
    }
    replacementRows = await db.exercise.findMany({
      where: { userId, deletedAt: null, id: { in: entries.map(([, id]) => id) } },
      select: { id: true },
    });
    const known = new Set(replacementRows.map((r) => r.id));
    for (const [, exerciseId] of entries) {
      if (!known.has(exerciseId)) throw badRequest(`replacements target is not one of your exercises: ${exerciseId}`);
    }
  }

  // ---- validation: notes keys belong to this day ----
  if (patch.notes != null) {
    for (const reId of Object.keys(patch.notes)) {
      if (!reIds.has(reId)) throw badRequest(`notes key is not an exercise of this day: ${reId}`);
    }
  }

  const existing = await db.dayOverride.findUnique({ where: { userId_dayId: { userId, dayId } } });
  const current = parseOverride(existing);
  const next: OverridePayload = {
    seriesOrder: patch.seriesOrder !== undefined ? (patch.seriesOrder ?? null) : current.seriesOrder,
    replacements: patch.replacements !== undefined ? (patch.replacements ?? {}) : current.replacements,
    notes: patch.notes !== undefined ? (patch.notes ?? {}) : current.notes,
  };

  const data = {
    // SQLite Json null = the Prisma.DbNull sentinel (typed null for Json fields).
    // Values are stored as PARSED Json (arrays/objects) — Part 9 §5 read paths
    // (day merge + appendDayToWorkout) tolerate legacy string-encoded rows.
    seriesOrder: next.seriesOrder ? (next.seriesOrder as Prisma.InputJsonValue) : Prisma.DbNull,
    replacements: Object.keys(next.replacements).length > 0 ? (next.replacements as Prisma.InputJsonValue) : Prisma.DbNull,
    notes: Object.keys(next.notes).length > 0 ? (next.notes as Prisma.InputJsonValue) : Prisma.DbNull,
  };

  await db.dayOverride.upsert({
    where: { userId_dayId: { userId, dayId } },
    update: data,
    create: { id: uuid7(), userId, dayId, ...data },
  });
  return { ok: true };
}

// ---------- §5 favourites (POST toggle · DELETE remove) ----------

export async function getDayFavourite(userId: string, dayId: string): Promise<{ isFavorite: boolean }> {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId }, select: { id: true } });
  if (!day) throw notFound("Day not found");
  const row = await db.dayFavorite.findUnique({ where: { userId_dayId: { userId, dayId } } });
  return { isFavorite: row != null };
}

/** POST — toggle (legacy route semantics: one call flips the star). */
export async function toggleDayFavouriteV2(userId: string, dayId: string): Promise<{ isFavorite: boolean }> {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId }, select: { id: true } });
  if (!day) throw notFound("Day not found");
  const existing = await db.dayFavorite.findUnique({ where: { userId_dayId: { userId, dayId } } });
  if (existing) {
    await db.dayFavorite.delete({ where: { userId_dayId: { userId, dayId } } });
    await db.routineDay.update({ where: { id: dayId }, data: { isFavorite: false } });
    return { isFavorite: false };
  }
  await db.dayFavorite.create({ data: { userId, dayId } });
  await db.routineDay.update({ where: { id: dayId }, data: { isFavorite: true } });
  return { isFavorite: true };
}

/** DELETE — remove (idempotent). */
export async function removeDayFavouriteV2(userId: string, dayId: string): Promise<{ isFavorite: boolean }> {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId }, select: { id: true } });
  if (!day) throw notFound("Day not found");
  const existing = await db.dayFavorite.findUnique({ where: { userId_dayId: { userId, dayId } } });
  if (existing) {
    await db.dayFavorite.delete({ where: { userId_dayId: { userId, dayId } } });
    await db.routineDay.update({ where: { id: dayId }, data: { isFavorite: false } });
  }
  return { isFavorite: false };
}

// ---------- §5 Mark off (day-first) ----------

async function loadOwnedDayRoutine(userId: string, dayId: string): Promise<{ routineId: string }> {
  const day = await db.routineDay.findFirst({ where: { id: dayId, userId }, select: { routineId: true } });
  if (!day) throw notFound("Day not found");
  return { routineId: day.routineId };
}

/** The mark-off Log (PROGRAM · durationSec 0 · finished) minted by markDayOff. */
function markOffWorkoutWhere(dayId: string) {
  return {
    sourceDayId: dayId,
    durationSec: 0,
    finishedAt: { not: null },
    removedAt: null,
  } as const;
}

/**
 * POST /api/days/:dayId/mark-off — delegates to program-service markDayOff
 * (completed marker + DONE entry + cursor advance) and ALSO returns the
 * workoutId of the minted mark-off Log so the client Undo can revert it.
 */
export async function markDayOffV2(
  userId: string,
  dayId: string,
): Promise<{ completedDayIds: string[]; advanced: boolean; workoutId: string | null }> {
  const { routineId } = await loadOwnedDayRoutine(userId, dayId);
  const result = await markDayOff(userId, routineId, dayId);
  // The workout is minted inside program-service (import-only file) — resolve
  // it by provenance: the newest finished, non-removed PROGRAM log for this day
  // with duration 0 (mark-off logs are the only such rows).
  const workout = await db.workout.findFirst({
    where: { userId, ...markOffWorkoutWhere(dayId) },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return { ...result, workoutId: workout?.id ?? null };
}

/**
 * DELETE /api/days/:dayId/mark-off — Undo: clears the completed marker
 * (program-service unmarkDayOff) and soft-removes every mark-off Log for the
 * day (removedAt + USER_DELETE, the §6.9 semantics the Removed items list
 * restores from). Their DONE schedule entries are soft-deleted alongside.
 */
export async function unmarkDayOffV2(userId: string, dayId: string): Promise<{ completedDayIds: string[]; removedWorkouts: number }> {
  const { routineId } = await loadOwnedDayRoutine(userId, dayId);
  const result = await unmarkDayOff(userId, routineId, dayId);
  const workouts = await db.workout.findMany({
    where: { userId, ...markOffWorkoutWhere(dayId) },
    select: { id: true },
  });
  if (workouts.length > 0) {
    const now = new Date();
    await db.workout.updateMany({
      where: { userId, id: { in: workouts.map((w) => w.id) } },
      data: { removedAt: now, removeReason: "USER_DELETE" },
    });
    await db.scheduleEntry.updateMany({
      where: { userId, workoutId: { in: workouts.map((w) => w.id) }, status: "DONE", markedOff: true },
      data: { deletedAt: now },
    });
  }
  return { ...result, removedWorkouts: workouts.length };
}

// ---------- §5.2 suggestions ----------

export async function getExerciseSuggestions(userId: string, exerciseId: string): Promise<{ suggestions: ExerciseSuggestionDTO[] }> {
  const exercise = await db.exercise.findFirst({
    where: { id: exerciseId, userId, deletedAt: null },
  });
  if (!exercise) throw notFound("Exercise not found");

  const myMuscles = new Set(jsonStringArray(exercise.primaryMuscles));
  const candidates = await db.exercise.findMany({
    where: { userId, deletedAt: null, id: { not: exerciseId } },
    select: { id: true, name: true, primaryMuscles: true, equipment: true, altGroup: true, thumbnailUrl: true },
    orderBy: { name: "asc" },
  });

  const scored = candidates
    .map((c) => {
      const sameAlt = exercise.altGroup != null && c.altGroup === exercise.altGroup;
      const muscles = jsonStringArray(c.primaryMuscles);
      const overlap = muscles.reduce((n, m) => n + (myMuscles.has(m) ? 1 : 0), 0);
      return { c, sameAlt, overlap, muscles };
    })
    .filter((x) => x.sameAlt || x.overlap > 0)
    .sort(
      (a, b) =>
        Number(b.sameAlt) - Number(a.sameAlt) ||
        b.overlap - a.overlap ||
        a.c.name.localeCompare(b.c.name),
    )
    .slice(0, 8);

  return {
    suggestions: scored.map(({ c, muscles }) => ({
      id: c.id,
      name: c.name,
      primaryMuscles: muscles,
      equipment: jsonStringArray(c.equipment),
      altGroup: c.altGroup ?? null,
      thumbnailUrl: c.thumbnailUrl ?? null,
    })),
  };
}

// ---------- §4 PhaseOverride order ----------

async function loadOwnedPhase(userId: string, phaseId: string) {
  const phase = await db.programPhase.findFirst({
    where: { id: phaseId },
    include: { variant: { include: { routine: { select: { id: true, userId: true } } } } },
  });
  if (!phase || phase.variant.routine.userId !== userId) throw notFound("Phase not found");
  return phase;
}

/** PUT /api/phases/:phaseId/order — upsert the per-user day order. */
export async function putPhaseOrder(userId: string, phaseId: string, dayOrder: string[]): Promise<{ phaseId: string; dayOrder: string[] }> {
  const phase = await loadOwnedPhase(userId, phaseId);
  const phaseDays = await db.routineDay.findMany({
    where: { phaseId: phase.id, userId },
    select: { id: true },
  });
  const known = new Set(phaseDays.map((d) => d.id));
  for (const id of dayOrder) {
    if (!known.has(id)) throw badRequest(`dayOrder references a day outside this phase: ${id}`);
  }
  await db.phaseOverride.upsert({
    where: { userId_phaseId: { userId, phaseId } },
    update: { dayOrder: JSON.stringify(dayOrder) },
    create: { id: uuid7(), userId, phaseId, dayOrder: JSON.stringify(dayOrder) },
  });
  return { phaseId, dayOrder };
}

/** DELETE /api/phases/:phaseId/order — Reset Order. */
export async function deletePhaseOrder(userId: string, phaseId: string): Promise<{ ok: true }> {
  const phase = await loadOwnedPhase(userId, phaseId);
  await db.phaseOverride.deleteMany({ where: { userId, phaseId: phase.id } });
  return { ok: true };
}
