// Programs, sessions, scheduling & dashboard (Part 5).
//
// The cursor is server state; every read runs the lazy rule engine
// (`applyProgramRules`) first so REST auto-advance, FINISH_OR_MIDNIGHT midnight
// catch-up and FIRST_SET all converge idempotently. Schedule status transitions
// are likewise derived on read and persisted opportunistically.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { dayKey, toDayUtc } from "@/lib/dates";
import { badRequest, conflict, notFound } from "../http";
import { estOneRmByMethod, roundToStep } from "@/lib/formulas";
import { generateWarmup, evaluateProgression, type WarmupScheme, type ProgressionRuleLike, type ProgressionStateLike } from "@/lib/grouping";
import { mapRoutine, mapScheduleEntry, mapWorkout } from "../mappers";
import type { Prisma, Routine, RoutineDay, ScheduleEntry, Workout } from "@prisma/client";
import {
  addDaysKey,
  advanceIndex,
  clampCursor,
  compareDateKeys,
  deriveEntryStatus,
  isFollowable,
  isValidSession,
  localDateKey,
  missedCutoffMs as missedCutoffMsFor,
  projectCursor,
  shouldAdvanceCursor,
  type ProgramDay,
} from "./program-rules";
import { recomputePRs, workoutInclude } from "./workout-service";

// ---------- shared includes ----------

const dayInclude = {
  exercises: {
    orderBy: { sortOrder: "asc" as const },
    include: { exercise: { include: { category: true } }, sets: { orderBy: { sortOrder: "asc" as const } } },
  },
} satisfies Prisma.RoutineDayInclude;

const routineInclude = {
  days: { orderBy: { sortOrder: "asc" as const }, include: dayInclude },
} satisfies Prisma.RoutineInclude;

type DayFull = RoutineDay & Prisma.RoutineDayGetPayload<{ include: typeof dayInclude }>;
type RoutineFull = Routine & { days: DayFull[] };

const entryInclude = { routine: true, day: true } satisfies Prisma.ScheduleEntryInclude;

// ---------- settings / today ----------

async function getProgramSettings(userId: string) {
  const s = await db.userSettings.findUnique({ where: { userId } });
  if (!s) throw notFound("Settings not found");
  return {
    timezone: s.timezone || "UTC",
    autoAdvanceRest: s.autoAdvanceRest,
    scheduleMovesCursor: s.scheduleMovesCursor,
    advanceTrigger: s.advanceTrigger,
    showProjectedDays: s.showProjectedDays,
    weeklyWorkoutTarget: s.weeklyWorkoutTarget,
  };
}

// ---------- lazy rule engine ----------

function toProgramDay(d: RoutineDay): ProgramDay {
  return { id: d.id, name: d.name, dayType: d.dayType ?? "WORKOUT" };
}

/**
 * "Real logged data" = the user actually touched the workout:
 * a completed set, a stamped completedAt, or a set with values whose
 * updatedAt > createdAt (user edit — template prefills are untouched).
 */
export function workoutHasLoggedData(w: {
  exercises: Array<{ sets: Array<{ isComplete: boolean; completedAt: Date | null; weight: number | null; reps: number | null; distance: number | null; timeSec: number | null; createdAt: Date; updatedAt: Date }> }>;
}): boolean {
  return w.exercises.some((e) =>
    e.sets.some(
      (s) =>
        s.isComplete ||
        s.completedAt != null ||
        ((s.weight != null || s.reps != null || s.distance != null || s.timeSec != null) &&
          s.updatedAt.getTime() > s.createdAt.getTime()),
    ),
  );
}

/** Workout logged from this routine/day with at least one set of real data. */
async function findQualifyingWorkout(userId: string, routineId: string, dayId: string) {
  const w = await db.workout.findFirst({
    where: { userId, sourceRoutineId: routineId, sourceDayId: dayId },
    include: { exercises: { include: { sets: true } } },
    orderBy: { date: "desc" },
  });
  if (!w) return null;
  const hasLoggedData = workoutHasLoggedData(w);
  return {
    id: w.id,
    dateKey: dayKey(w.date),
    finished: !!w.finishedAt,
    hasLoggedData,
    scheduledStart: w.scheduledStart,
  };
}

async function loadActive(userId: string) {
  return db.activeRoutine.findUnique({
    where: { userId },
    include: { routine: { include: routineInclude } },
  });
}

/**
 * Run the lazy cursor rules for a user. Returns the (possibly updated) active
 * state + resolved today key. Safe to call on every relevant read.
 */
export async function applyProgramRules(userId: string) {
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  const active = await loadActive(userId);
  if (!active) return { todayKey, settings, active: null, days: [] as ProgramDay[] };

  const days = active.routine.days;
  let idx = clampCursor(active.cursorDayIndex, days.length);
  let anchor =
    active.lastAdvancedForDate ?? localDateKey(settings.timezone, active.startedAt);
  let dirty = false;

  const persist = async () => {
    await db.activeRoutine.update({
      where: { id: active.id },
      data: {
        cursorDayIndex: idx,
        lastAdvancedAt: new Date(),
        lastAdvancedForDate: anchor,
      },
    });
  };

  const guardMax = days.length * 2 + 8;
  for (let guard = 0; guard < guardMax; guard++) {
    const day = days[idx];
    if (!day) break;

    const workout = await findQualifyingWorkout(userId, active.routineId, day.id);
    // schedule gate: logging a scheduled active-routine day moves the cursor
    // only when scheduleMovesCursor is on
    const qualifying =
      workout && (!workout.scheduledStart || settings.scheduleMovesCursor)
        ? workout
        : null;

    const advance = shouldAdvanceCursor({
      day: toProgramDay(day),
      todayKey,
      anchorKey: anchor,
      settings,
      qualifyingWorkout: qualifying
        ? {
            hasLoggedData: qualifying.hasLoggedData,
            dateKey: qualifying.dateKey,
            finished: qualifying.finished,
          }
        : null,
    });
    if (!advance) break;

    idx = advanceIndex(idx, days.length, 1);
    anchor = addDaysKey(anchor, 1);
    dirty = true;
  }

  if (dirty || idx !== active.cursorDayIndex) {
    if (idx !== clampCursor(active.cursorDayIndex, days.length)) dirty = true;
    await persist();
  }

  return {
    todayKey,
    settings,
    active: { ...active, cursorDayIndex: idx },
    days: days.map(toProgramDay),
  };
}

/** Explicit cursor movement (skip / rest-done / advance / jump). */
async function moveCursor(
  userId: string,
  mode: { kind: "advance"; n: number } | { kind: "jump"; dayIndex: number },
) {
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  const active = await loadActive(userId);
  if (!active) throw badRequest("No program followed");
  const len = active.routine.days.length;
  if (len === 0) throw badRequest("Program has no days");

  const nextIdx =
    mode.kind === "advance"
      ? advanceIndex(active.cursorDayIndex, len, mode.n)
      : clampCursor(mode.dayIndex, len);

  await db.activeRoutine.update({
    where: { id: active.id },
    data: {
      cursorDayIndex: nextIdx,
      lastAdvancedAt: new Date(),
      lastAdvancedForDate: todayKey,
    },
  });
  const day = active.routine.days[nextIdx];
  return { dayIndex: nextIdx, day: toProgramDay(day) };
}

// ---------- follow / unfollow ----------

export async function followProgram(userId: string, routineId: string, input: { startDayIndex?: number } = {}) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId, deletedAt: null }, include: routineInclude });
  if (!r) throw notFound("Program not found");
  if (!isFollowable(r.kind ?? "ROUTINE", r.days)) {
    throw badRequest("Only routines with at least one workout day can be followed");
  }
  const start = clampCursor(input.startDayIndex ?? 0, r.days.length);
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  await db.$transaction(async (tx) => {
    await tx.activeRoutine.deleteMany({ where: { userId } });
    await tx.activeRoutine.create({
      data: {
        id: uuid7(),
        userId,
        routineId: r.id,
        cursorDayIndex: start,
        startedAt: new Date(),
        lastAdvancedAt: null,
        lastAdvancedForDate: todayKey,
      },
    });
  });
  return { routineId: r.id, dayIndex: start, day: toProgramDay(r.days[start]) };
}

export async function unfollowProgram(userId: string) {
  await db.activeRoutine.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function getActiveRoutineState(userId: string) {
  const active = await loadActive(userId);
  if (!active) return null;
  const idx = clampCursor(active.cursorDayIndex, active.routine.days.length);
  const day = active.routine.days[idx];
  return {
    routineId: active.routineId,
    routineName: active.routine.name,
    routineKind: active.routine.kind ?? "ROUTINE",
    cursorDayIndex: idx,
    dayCount: active.routine.days.length,
    dayId: day?.id ?? "",
    dayName: day?.name ?? "",
    dayType: day?.dayType ?? "WORKOUT",
    startedAt: active.startedAt.toISOString(),
  };
}

// ---------- cursor ops ----------

export async function advanceCursorOp(userId: string, n: number) {
  return moveCursor(userId, { kind: "advance", n });
}

export async function jumpCursorOp(userId: string, dayIndex: number) {
  return moveCursor(userId, { kind: "jump", dayIndex });
}

/** Skip the current cursor day: advance + SKIPPED audit entry for today. */
export async function skipCursorDay(userId: string) {
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  const active = await loadActive(userId);
  if (!active) throw badRequest("No program followed");
  const len = active.routine.days.length;
  if (len === 0) throw badRequest("Program has no days");
  const skippedIdx = clampCursor(active.cursorDayIndex, len);
  const skippedDay = active.routine.days[skippedIdx];
  const nextIdx = advanceIndex(skippedIdx, len, 1);

  await db.$transaction(async (tx) => {
    await tx.activeRoutine.update({
      where: { id: active.id },
      data: {
        cursorDayIndex: nextIdx,
        lastAdvancedAt: new Date(),
        lastAdvancedForDate: todayKey,
      },
    });
    // audit: convert today's matching PLANNED entry, else create a SKIPPED one
    const planned = await tx.scheduleEntry.findFirst({
      where: {
        userId,
        date: toDayUtc(todayKey),
        status: "PLANNED",
        deletedAt: null,
      },
    });
    if (planned && planned.routineId === active.routineId && planned.dayId === skippedDay.id) {
      await tx.scheduleEntry.update({ where: { id: planned.id }, data: { status: "SKIPPED" } });
    } else {
      await tx.scheduleEntry.create({
        data: {
          id: uuid7(),
          userId,
          date: toDayUtc(todayKey),
          sourceType: "ROUTINE_DAY",
          routineId: active.routineId,
          dayId: skippedDay.id,
          status: "SKIPPED",
        },
      });
    }
  });
  const nextDay = active.routine.days[nextIdx];
  return { skipped: toProgramDay(skippedDay), dayIndex: nextIdx, day: toProgramDay(nextDay) };
}

/** "Mark rest done": advance from a REST day without waiting for midnight. */
export async function markRestDone(userId: string) {
  const active = await loadActive(userId);
  if (!active) throw badRequest("No program followed");
  const idx = clampCursor(active.cursorDayIndex, active.routine.days.length);
  const day = active.routine.days[idx];
  if ((day?.dayType ?? "WORKOUT") !== "REST") throw badRequest("Current day is not a rest day");
  return moveCursor(userId, { kind: "advance", n: 1 });
}

// ---------- start day → workout (transactional) ----------

/** Shared: append a routine day's exercises + predefined sets to a workout. */
export async function appendDayToWorkout(
  tx: Prisma.TransactionClient,
  userId: string,
  day: DayFull,
  workoutId: string,
  date: Date,
): Promise<Set<string>> {
  // recreate routine groups in the workout
  const routineGroupIds = new Set(day.exercises.map((e) => e.groupId).filter(Boolean));
  const groupMap = new Map<string, string>();
  for (const gid of routineGroupIds) {
    const rg = await tx.routineGroup.findFirst({ where: { id: gid!, userId } });
    if (!rg) continue;
    const existing = await tx.workoutGroup.findFirst({ where: { workoutId, name: rg.name } });
    const g =
      existing ??
      (await tx.workoutGroup.create({
        data: { id: uuid7(), userId, workoutId, name: rg.name, colour: rg.colour },
      }));
    groupMap.set(gid!, g.id);
  }

  const affected = new Set<string>();
  let sortOrder = await tx.workoutExercise.count({ where: { workoutId } });

  for (const re of day.exercises) {
    affected.add(re.exerciseId);
    let twe = await tx.workoutExercise.findFirst({ where: { workoutId, exerciseId: re.exerciseId } });
    if (!twe) {
      twe = await tx.workoutExercise.create({
        data: {
          id: uuid7(),
          userId,
          workoutId,
          exerciseId: re.exerciseId,
          sortOrder: sortOrder++,
          groupId: re.groupId ? groupMap.get(re.groupId) ?? null : null,
        },
      });
    } else if (re.groupId && !twe.groupId) {
      await tx.workoutExercise.update({
        where: { id: twe.id },
        data: { groupId: groupMap.get(re.groupId) ?? null },
      });
    }

    const predefined = re.sets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    type SetValues = {
      weight: number | null;
      reps: number | null;
      distance: number | null;
      timeSec: number | null;
      setType: string | null;
      rpe: number | null;
      tempo: string | null;
      restPlannedSec: number | null;
    };

    // ---- Part 8 §6.4: %1RM resolution (falls back to copy-last without e1RM) ----
    const prs = await tx.personalRecord.findMany({ where: { userId, exerciseId: re.exerciseId } });
    const e1rmMethod = (await tx.userSettings.findUnique({ where: { userId } }))?.e1rmMethod ?? "BRZYCKI";
    const e1rm =
      prs.length > 0
        ? Math.max(...prs.map((pr) => estOneRmByMethod(pr.weight, pr.reps, e1rmMethod)))
        : null;
    const plateStep = (await tx.exercise.findUnique({ where: { id: re.exerciseId } }))?.weightIncrement
      ?? (await tx.userSettings.findUnique({ where: { userId } }))?.defaultWeightIncrement
      ?? 2.5;
    const resolveWeight = (s: { weightKind: string | null; pct: number | null; weight: number | null }): number | null => {
      if (s.weightKind === "PERCENT_1RM") {
        if (e1rm == null || !s.pct) return null; // fallback → copy-last path
        return Math.max(0, roundToStep((e1rm * s.pct) / 100, plateStep));
      }
      return s.weight;
    };

    // ---- Part 8 §6.3: progression delta applied to copy-last presets ----
    const progState = await tx.progressionState.findUnique({ where: { routineExerciseId: re.id } });
    const nextDelta = progState?.nextWeightDelta ?? 0;
    const fromRow = (s: {
      weight: number | null;
      reps: number | null;
      distance: number | null;
      timeSec: number | null;
      setType: string | null;
      rpe: number | null;
      tempo: string | null;
      restPlannedSec: number | null;
    }): SetValues => ({
      weight: s.weight,
      reps: s.reps,
      distance: s.distance,
      timeSec: s.timeSec,
      setType: s.setType ?? null,
      rpe: s.rpe ?? null,
      tempo: s.tempo ?? null,
      restPlannedSec: s.restPlannedSec ?? null,
    });

    const blank = (s: { weight: number | null; reps: number | null; distance: number | null; timeSec: number | null; weightKind: string | null }) =>
      s.weight == null && s.weightKind !== "PERCENT_1RM" && s.reps == null && s.distance == null && s.timeSec == null;
    const isBlank = predefined.length > 0 && predefined.every(blank);
    const anyBlank = predefined.some(blank);

    // previous performance for this exercise (for copy-previous semantics)
    const prev =
      anyBlank || isBlank
        ? await tx.workoutExercise.findFirst({
            where: { userId, exerciseId: re.exerciseId, workout: { date: { lt: date } } },
            include: { sets: { orderBy: { sortOrder: "asc" } } },
            orderBy: { workout: { date: "desc" } },
          })
        : null;

    let setsToAdd: Array<SetValues>;
    if (isBlank) {
      // all-blank template = "copy whatever I did last time" (set count follows previous)
      setsToAdd = prev ? prev.sets.map(fromRow) : [];
    } else {
      // valued/mixed template: blank rows copy the previous set at the same
      // index when one exists, otherwise they become empty placeholder rows
      setsToAdd = predefined.map((s, i) => {
        if (blank(s) && prev?.sets[i]) {
          const p = fromRow(prev.sets[i]);
          return { ...p, setType: s.setType ?? p.setType };
        }
        return fromRow(s);
      });
    }

    // §6.4: resolve %1RM prescriptions now that copy-last has run
    setsToAdd = setsToAdd.map((v, i) => {
      const tpl = predefined[i];
      if (!tpl) return v;
      const resolved = resolveWeight(tpl);
      if (tpl.weightKind === "PERCENT_1RM") {
        // resolved == null (no e1RM) → fall back to copy-last value already in v
        return resolved != null ? { ...v, weight: resolved } : v;
      }
      return v;
    });

    // §6.3: apply the progression delta to the first working weight when this
    // session copies previous (copy-last semantics) — deload lowers, raise adds.
    if (nextDelta !== 0 && setsToAdd.length > 0) {
      const firstIdx = setsToAdd.findIndex((v) => v.setType !== "WARMUP" && v.weight != null);
      if (firstIdx >= 0) {
        const w = setsToAdd[firstIdx].weight!;
        setsToAdd[firstIdx] = { ...setsToAdd[firstIdx], weight: Math.max(0, roundToStep(w + nextDelta, plateStep)) };
      }
    }

    // §6.2: warm-up generation — from the first working weight, resolved AFTER
    // copy-last/1RM/progression (spec ordering). Prepended as type W rows.
    const scheme = (re.warmupScheme ?? "NONE") as WarmupScheme;
    if (scheme !== "NONE") {
      const firstWorking = setsToAdd.find((v) => v.setType !== "WARMUP" && v.weight != null)?.weight ?? null;
      if (firstWorking != null) {
        const custom = Array.isArray(re.warmupCustom)
          ? (re.warmupCustom as Array<{ pct: number; reps: number }>)
          : null;
        const warmupSets = generateWarmup(firstWorking, scheme, custom, plateStep);
        setsToAdd = [
          ...warmupSets.map((w) => ({
            weight: w.weight,
            reps: w.reps,
            distance: null,
            timeSec: null,
            setType: "WARMUP",
            rpe: null,
            tempo: null,
            restPlannedSec: null,
          })),
          ...setsToAdd,
        ];
      }
    }

    let setOrder = await tx.trainingSet.count({ where: { workoutExerciseId: twe.id } });
    for (const s of setsToAdd) {
      await tx.trainingSet.create({
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
  return affected;
}

/**
 * Start a program day / session: upsert the workout at `date`, stamp
 * provenance, insert predefined sets (existing log-day logic), link/create the
 * schedule DONE entry — all in ONE transaction.
 */
export async function startProgramDay(
  userId: string,
  routineId: string,
  input: { dayId?: string; date?: string },
) {
  const r = await db.routine.findFirst({ where: { id: routineId, userId, deletedAt: null }, include: routineInclude });
  if (!r) throw notFound("Program not found");
  const kind = r.kind ?? "ROUTINE";

  let day: DayFull | undefined;
  if (input.dayId) {
    day = r.days.find((d) => d.id === input.dayId);
  } else if (kind === "SESSION") {
    day = r.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST");
  } else {
    const active = await loadActive(userId);
    if (active && active.routineId === r.id) {
      day = r.days[clampCursor(active.cursorDayIndex, r.days.length)];
    }
    day = day ?? r.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST");
  }
  if (!day) throw badRequest("Program has no workout day to start");
  if ((day.dayType ?? "WORKOUT") === "REST") throw badRequest("Cannot start a rest day");

  const settings = await getProgramSettings(userId);
  const todayKey = input.date ?? localDateKey(settings.timezone, new Date());
  const date = toDayUtc(todayKey);

  // was this day scheduled? (PLANNED entry matching routine+day+date)
  const planned = await db.scheduleEntry.findFirst({
    where: { userId, date, status: "PLANNED", deletedAt: null },
  });
  const wasScheduled =
    !!planned && planned.routineId === r.id && (planned.dayId === day.id || kind === "SESSION");

  const workout = await db.$transaction(async (tx) => {
    // Part 8: several sessions per day are allowed — continue the ACTIVE one.
    const active =
      (await tx.workout.findFirst({
        where: { userId, date, removedAt: null, finishedAt: null },
        orderBy: { createdAt: "desc" },
      })) ??
      (await tx.workout.create({ data: { id: uuid7(), userId, date } }));
    const w = active;
    await tx.workout.update({
      where: { id: w.id },
      data: {
        sourceType: kind === "SESSION" ? "SESSION" : "ROUTINE_DAY",
        sourceRoutineId: r.id,
        sourceDayId: day!.id,
        scheduledStart: wasScheduled,
        startAt: w.startAt ?? new Date(),
      },
    });
    const affected = await appendDayToWorkout(tx, userId, day!, w.id, date);
    for (const exerciseId of affected) await recomputePRs(tx, userId, exerciseId);

    // schedule entry: PLANNED (matching) → DONE + link; else auto-create DONE
    if (planned && wasScheduled) {
      await tx.scheduleEntry.update({
        where: { id: planned.id },
        data: { status: "DONE", workoutId: w.id },
      });
    } else if (!planned) {
      await tx.scheduleEntry.create({
        data: {
          id: uuid7(),
          userId,
          date,
          sourceType: kind === "SESSION" ? "SESSION" : "ROUTINE_DAY",
          routineId: r.id,
          dayId: day!.id,
          status: "DONE",
          workoutId: w.id,
        },
      });
    }
    return tx.workout.findUnique({ where: { id: w.id }, include: workoutInclude });
  });

  return mapWorkout(workout!);
}

// ---------- finish / undo ----------

async function tryAdvanceForWorkout(userId: string, workout: Workout, opts: { forceFinishPath: boolean }) {
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  const active = await loadActive(userId);
  if (!active) return { advanced: false, nextDay: null };
  if (workout.sourceRoutineId !== active.routineId) return { advanced: false, nextDay: null };
  const days = active.routine.days;
  const idx = clampCursor(active.cursorDayIndex, days.length);
  const day = days[idx];
  if (!day || day.id !== workout.sourceDayId) return { advanced: false, nextDay: null };
  if (workout.scheduledStart && !settings.scheduleMovesCursor) {
    return { advanced: false, nextDay: null };
  }

  const qualifying = await findQualifyingWorkout(userId, active.routineId, day.id);
  if (!qualifying) return { advanced: false, nextDay: null };

  const advance = opts.forceFinishPath
    ? qualifying.hasLoggedData || workout.finishedAt != null
    : shouldAdvanceCursor({
        day: toProgramDay(day),
        todayKey,
        anchorKey: active.lastAdvancedForDate ?? localDateKey(settings.timezone, active.startedAt),
        settings,
        qualifyingWorkout: {
          hasLoggedData: qualifying.hasLoggedData,
          dateKey: qualifying.dateKey,
          finished: qualifying.finished,
        },
      });
  if (!advance) return { advanced: false, nextDay: null };

  const nextIdx = advanceIndex(idx, days.length, 1);
  await db.activeRoutine.update({
    where: { id: active.id },
    data: {
      cursorDayIndex: nextIdx,
      lastAdvancedAt: new Date(),
      lastAdvancedForDate: todayKey,
    },
  });
  const nextDay = days[nextIdx];
  return { advanced: true, nextDay: toProgramDay(nextDay) };
}

export async function finishWorkout(userId: string, workoutId: string) {
  const w = await db.workout.findFirst({ where: { id: workoutId, userId } });
  if (!w) throw notFound("Workout not found");
  const finishedAt = w.finishedAt ?? new Date();
  await db.workout.update({
    where: { id: w.id },
    data: { finishedAt, endAt: w.endAt ?? finishedAt },
  });
  // Part 8 §6.3: evaluate progression rules for sessions sourced from a routine.
  await evaluateWorkoutProgression(userId, w.id);
  const refreshed = await db.workout.findUnique({ where: { id: w.id } });
  const { advanced, nextDay } = await tryAdvanceForWorkout(userId, refreshed!, { forceFinishPath: true });
  return { workoutId: w.id, finishedAt: finishedAt.toISOString(), advanced, nextDay };
}

/**
 * §6.3 — on Finish of a session sourced from that routine: evaluate each
 * exercise's rule against its target reps, write ProgressionState. Undo via
 * the finish-undo window reverts nothing here (state is idempotent by design;
 * the next evaluation overwrites).
 */
async function evaluateWorkoutProgression(userId: string, workoutId: string) {
  const w = await db.workout.findFirst({
    where: { id: workoutId, userId },
    include: {
      exercises: { include: { sets: { orderBy: { sortOrder: "asc" } }, exercise: true } },
      sourceDay: { include: { exercises: { include: { sets: true } } } },
    },
  });
  if (!w?.sourceDay) return;
  const settings = await db.userSettings.findUnique({ where: { userId } });
  for (const we of w.exercises) {
    const re = w.sourceDay!.exercises.find((r) => r.exerciseId === we.exerciseId);
    if (!re) continue;
    const rule = await db.progressionRule.findUnique({ where: { routineExerciseId: re.id } });
    if (!rule || rule.type === "NONE") continue;
    const prev = await db.progressionState.findUnique({ where: { routineExerciseId: re.id } });
    const plateStep = we.exercise.weightIncrement ?? settings?.defaultWeightIncrement ?? 2.5;
    const performed = we.sets
      .filter((s) => s.setType !== "WARMUP")
      .map((s) => ({
        weight: s.weight,
        reps: s.reps,
        // target = the template reps at the same index (blank → performed reps)
        targetReps: re.sets.find((tpl) => tpl.sortOrder === s.sortOrder)?.reps ?? null,
        isComplete: s.isComplete,
      }));
    const ruleLike: ProgressionRuleLike = {
      type: rule.type as "LINEAR" | "DOUBLE" | "NONE",
      increment: rule.increment,
      unit: rule.unit,
      condition: rule.condition as "ALL_SETS_HIT" | "LAST_SET_HIT",
      failStreakForDeload: rule.failStreakForDeload,
      deloadPct: rule.deloadPct,
    };
    const prevLike: ProgressionStateLike = {
      nextWeightDelta: prev?.nextWeightDelta ?? 0,
      failStreak: prev?.failStreak ?? 0,
    };
    const next = evaluateProgression(ruleLike, performed, prevLike, plateStep);
    await db.progressionState.upsert({
      where: { routineExerciseId: re.id },
      create: { id: uuid7(), userId, routineExerciseId: re.id, ...next },
      update: next,
    });
  }
}

/** Undo within the 10s window: revert finishedAt and (best-effort) the cursor. */
export async function undoFinishWorkout(userId: string, workoutId: string) {
  const w = await db.workout.findFirst({ where: { id: workoutId, userId } });
  if (!w) throw notFound("Workout not found");
  await db.workout.update({
    where: { id: w.id },
    data: { finishedAt: null },
  });

  const active = await loadActive(userId);
  if (
    active &&
    w.sourceRoutineId === active.routineId &&
    active.lastAdvancedAt &&
    Date.now() - active.lastAdvancedAt.getTime() < 120_000
  ) {
    // revert to this workout's day if the recent advance was (likely) from it
    const dayIdx = active.routine.days.findIndex((d) => d.id === w.sourceDayId);
    if (dayIdx >= 0) {
      const settings = await getProgramSettings(userId);
      const todayKey = localDateKey(settings.timezone, new Date());
      await db.activeRoutine.update({
        where: { id: active.id },
        data: { cursorDayIndex: dayIdx, lastAdvancedForDate: todayKey },
      });
    }
  }
  return { ok: true };
}

/** FIRST_SET hook — called after a set is saved with real data. */
export async function notifySetSaved(userId: string, workoutId: string) {
  const w = await db.workout.findFirst({ where: { id: workoutId, userId } });
  if (!w || !w.sourceRoutineId || !w.sourceDayId) return { advanced: false, nextDay: null };
  const result = await tryAdvanceForWorkout(userId, w, { forceFinishPath: false });
  if (!result.advanced) await applyProgramRules(userId);
  return result;
}

// ---------- schedule CRUD ----------

function assertScheduleShape(r: RoutineFull, dayId?: string) {
  const kind = r.kind ?? "ROUTINE";
  if (kind === "SESSION") {
    const day = r.days.find((d) => (d.dayType ?? "WORKOUT") !== "REST");
    if (!day) throw badRequest("Session has no workout day");
    if (!isValidSession(kind, r.days)) throw badRequest("Session must have exactly one workout day");
    return day;
  }
  if (!dayId) throw badRequest("dayId is required for routines");
  const day = r.days.find((d) => d.id === dayId);
  if (!day) throw badRequest("Day not found in this routine");
  if ((day.dayType ?? "WORKOUT") === "REST") throw badRequest("Cannot schedule a rest day");
  return day;
}

async function findPlannedConflict(userId: string, date: Date, exceptId?: string) {
  return db.scheduleEntry.findFirst({
    where: { userId, date, status: "PLANNED", deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: entryInclude,
  });
}

export async function createSchedule(
  userId: string,
  input: { date: string; routineId: string; dayId?: string; note?: string | null; replace?: boolean },
) {
  const r = await db.routine.findFirst({
    where: { id: input.routineId, userId, deletedAt: null },
    include: routineInclude,
  });
  if (!r) throw notFound("Program not found");
  const day = assertScheduleShape(r, input.dayId);
  const date = toDayUtc(input.date);

  const existing = await findPlannedConflict(userId, date);
  if (existing) {
    if (!input.replace) {
      throw conflict("A workout is already planned for this date", {
        date: input.date,
        entryId: existing.id,
        routineName: existing.routine.name,
        dayName: existing.day?.name ?? null,
      });
    }
    await db.scheduleEntry.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
  }

  const created = await db.scheduleEntry.create({
    data: {
      id: uuid7(),
      userId,
      date,
      sourceType: (r.kind ?? "ROUTINE") === "SESSION" ? "SESSION" : "ROUTINE_DAY",
      routineId: r.id,
      dayId: day.id,
      status: "PLANNED",
      note: input.note ?? null,
    },
    include: entryInclude,
  });
  return mapScheduleEntry(created);
}

export async function updateSchedule(
  userId: string,
  id: string,
  input: { date?: string; status?: string; note?: string | null },
) {
  const entry = await db.scheduleEntry.findFirst({ where: { id, userId, deletedAt: null }, include: entryInclude });
  if (!entry) throw notFound("Schedule entry not found");

  const data: Prisma.ScheduleEntryUpdateInput = {};
  if (input.date !== undefined) {
    const date = toDayUtc(input.date);
    if (!date.getTime() || Number.isNaN(date.getTime())) throw badRequest("Invalid date");
    const conflictEntry = await findPlannedConflict(userId, date, id);
    if (conflictEntry && entry.status === "PLANNED") {
      throw conflict("A workout is already planned for this date", {
        date: input.date,
        entryId: conflictEntry.id,
        routineName: conflictEntry.routine.name,
      });
    }
    data.date = date;
  }
  if (input.note !== undefined) data.note = input.note;

  if (input.status !== undefined) {
    if (input.status === "PLANNED") {
      // Reopen: only for date >= today
      const settings = await getProgramSettings(userId);
      const todayKey = localDateKey(settings.timezone, new Date());
      const dateKey = dayKey(input.date !== undefined ? toDayUtc(input.date) : entry.date);
      if (compareDateKeys(dateKey, todayKey) < 0) throw badRequest("Can only reopen entries from today onwards");
      const conflictEntry = await findPlannedConflict(
        userId,
        input.date !== undefined ? toDayUtc(input.date) : entry.date,
        id,
      );
      if (conflictEntry) throw conflict("A workout is already planned for this date");
      data.status = "PLANNED";
    } else if (input.status === "SKIPPED") {
      data.status = "SKIPPED";
    } else {
      throw badRequest("Status can only be set to SKIPPED (or PLANNED to reopen)");
    }
  }

  const updated = await db.scheduleEntry.update({ where: { id }, data, include: entryInclude });
  return mapScheduleEntry(updated);
}

export async function deleteSchedule(userId: string, id: string) {
  const entry = await db.scheduleEntry.findFirst({ where: { id, userId, deletedAt: null } });
  if (!entry) throw notFound("Schedule entry not found");
  await db.scheduleEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}

/** List entries in [from, to] with lazy status derivation + optional projection. */
export async function listSchedule(userId: string, input: { from?: string; to?: string }) {
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  await applyProgramRules(userId);

  const to = input.to ?? addDaysKey(todayKey, 60);
  const from = input.from ?? addDaysKey(todayKey, -60);
  const rows = await db.scheduleEntry.findMany({
    where: { userId, deletedAt: null, date: { gte: toDayUtc(from), lte: toDayUtc(to) } },
    include: {
      ...entryInclude,
      workout: { include: { exercises: { include: { sets: true } } } },
    },
    orderBy: { date: "asc" },
  });

  const entries: Array<ReturnType<typeof mapScheduleEntry>> = [];
  const nowMs = Date.now();
  for (const e of rows) {
    let status = e.status;
    if (e.status === "PLANNED" && e.workoutId && e.workout) {
      const hasData = workoutHasLoggedData(e.workout);
      const derived = deriveEntryStatus({
        storedStatus: "PLANNED",
        dateKey: dayKey(e.date),
        todayKey,
        linkedWorkoutHasData: hasData,
        linkedWorkoutFinished: !!e.workout.finishedAt,
        missedCutoffMs: missedCutoffMsFor(dayKey(e.date), e.timeOfDay),
        nowMs,
      });
      if (derived !== "PLANNED") {
        status = derived;
        await db.scheduleEntry.update({ where: { id: e.id }, data: { status: derived, ...(derived === "MISSED" ? { missedAt: e.missedAt ?? new Date(nowMs) } : {}) } });
      }
    } else if (e.status === "PLANNED") {
      const derived = deriveEntryStatus({
        storedStatus: "PLANNED",
        dateKey: dayKey(e.date),
        todayKey,
        linkedWorkoutHasData: false,
        linkedWorkoutFinished: false,
        missedCutoffMs: missedCutoffMsFor(dayKey(e.date), e.timeOfDay),
        nowMs,
      });
      if (derived !== "PLANNED") {
        status = derived;
        await db.scheduleEntry.update({ where: { id: e.id }, data: { status: derived, ...(derived === "MISSED" ? { missedAt: e.missedAt ?? new Date(nowMs) } : {}) } });
      }
    }
    entries.push(mapScheduleEntry({ ...e, status }));
  }

  // projected ghost days (calendar)
  let projected: Array<{ date: string; routineId: string; dayId: string; dayName: string; dayType: string }> = [];
  if (settings.showProjectedDays) {
    const active = await loadActive(userId);
    if (active) {
      const days = active.routine.days.map(toProgramDay);
      const idx = clampCursor(active.cursorDayIndex, days.length);
      const plannedDates = new Set(entries.filter((e) => e.status === "PLANNED").map((e) => e.date));
      projected = projectCursor({ days, startIndex: idx, todayKey, settings, count: 28 })
        .filter((p) => {
          const inRange = compareDateKeys(p.dateKey, from) >= 0 && compareDateKeys(p.dateKey, to) <= 0;
          return inRange && !plannedDates.has(p.dateKey) && p.day.dayType !== "REST";
        })
        .map((p) => ({
          date: p.dateKey,
          routineId: active.routineId,
          dayId: p.day.id,
          dayName: p.day.name,
          dayType: p.day.dayType,
        }));
    }
  }

  return { entries, projected };
}

// ---------- session from workout ----------

export async function sessionFromWorkout(userId: string, input: { workoutId: string; name?: string }) {
  const w = await db.workout.findFirst({
    where: { id: input.workoutId, userId },
    include: { exercises: { include: { sets: true } }, groups: true },
  });
  if (!w) throw notFound("Workout not found");

  const name = (input.name ?? "").trim() || `Session · ${dayKey(w.date)}`;
  const count = await db.routine.count({ where: { userId } });

  const routineId = uuid7();
  const dayId = uuid7();
  await db.$transaction(async (tx) => {
    await tx.routine.create({
      data: { id: routineId, userId, name, kind: "SESSION", sortOrder: count },
    });
    await tx.routineDay.create({
      data: { id: dayId, userId, routineId, name, dayType: "WORKOUT", sortOrder: 0 },
    });
    // recreate groups
    const groupMap = new Map<string, string>();
    for (const g of w.groups) {
      const created = await tx.routineGroup.create({
        data: { id: uuid7(), userId, routineId, name: g.name, colour: g.colour },
      });
      groupMap.set(g.id, created.id);
    }
    for (const we of w.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
      const reId = uuid7();
      await tx.routineExercise.create({
        data: {
          id: reId,
          userId,
          dayId,
          exerciseId: we.exerciseId,
          sortOrder: we.sortOrder,
          groupId: we.groupId ? groupMap.get(we.groupId) ?? null : null,
        },
      });
      const sets = we.sets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      for (const s of sets) {
        await tx.predefinedSet.create({
          data: {
            id: uuid7(),
            routineExerciseId: reId,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            timeSec: s.timeSec,
            setType: s.setType ?? "NORMAL",
            rpe: s.rpe,
            tempo: s.tempo,
            restPlannedSec: s.restPlannedSec,
            sortOrder: s.sortOrder,
          },
        });
      }
    }
  });

  const created = await db.routine.findUnique({ where: { id: routineId }, include: routineInclude });
  return mapRoutine(created!);
}

// ---------- programs list ----------

export async function listPrograms(userId: string, kind?: "ROUTINE" | "SESSION") {
  await applyProgramRules(userId);
  const routines = await db.routine.findMany({
    where: { userId, deletedAt: null, ...(kind ? { kind } : {}) },
    include: routineInclude,
    orderBy: { sortOrder: "asc" },
  });
  const active = await db.activeRoutine.findUnique({ where: { userId } });

  const lastUsed = await db.workout.groupBy({
    by: ["sourceRoutineId"],
    where: { userId, sourceRoutineId: { not: null } },
    _max: { date: true },
  });
  const lastUsedMap = new Map(lastUsed.map((r) => [r.sourceRoutineId!, r._max.date ?? null]));

  return routines.map((r) => {
    const workoutDays = r.days.filter((d) => (d.dayType ?? "WORKOUT") !== "REST");
    const exerciseCount = workoutDays.reduce((acc, d) => acc + d.exercises.length, 0);
    const last = lastUsedMap.get(r.id) ?? null;
    return {
      id: r.id,
      name: r.name,
      notes: r.notes ?? null,
      kind: r.kind ?? "ROUTINE",
      dayCount: r.days.length,
      restCount: r.days.length - workoutDays.length,
      exerciseCount,
      lastUsedAt: last ? dayKey(last) : null,
      isFollowed: active?.routineId === r.id,
      cursor:
        active?.routineId === r.id
          ? {
              dayIndex: clampCursor(active.cursorDayIndex, r.days.length),
              dayCount: r.days.length,
            }
          : null,
    };
  });
}

// ---------- dashboard ----------

export async function getDashboard(userId: string) {
  const rules = await applyProgramRules(userId);
  const { todayKey, settings } = rules;
  const todayDate = toDayUtc(todayKey);

  const [active, plannedToday, windowEntries, todayWorkoutRow] = await Promise.all([
    loadActive(userId),
    db.scheduleEntry.findFirst({
      where: { userId, date: todayDate, deletedAt: null },
      include: { ...entryInclude, workout: { include: { exercises: { include: { sets: true } } } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }], // PLANNED first
    }),
    db.scheduleEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: addDaysUtc(todayDate, 1), lte: addDaysUtc(todayDate, 7) },
      },
      include: entryInclude,
      orderBy: { date: "asc" },
    }),
    db.workout.findFirst({
      where: { userId, date: todayDate },
      include: { exercises: { include: { sets: true } } },
    }),
  ]);

  // ---- today resolution ----
  let today: {
    date: string;
    kind: "WORKOUT" | "REST" | "NONE";
    scheduled: ReturnType<typeof mapScheduleEntry> | null;
    routine: { id: string; name: string; kind: string } | null;
    day: { id: string; name: string; dayType: string; index: number; count: number } | null;
  };

  const plannedEntry = plannedToday && plannedToday.status === "PLANNED" ? plannedToday : null;

  if (plannedEntry) {
    const dayIdx = active && active.routineId === plannedEntry.routineId && plannedEntry.dayId
      ? active.routine.days.findIndex((d) => d.id === plannedEntry.dayId)
      : -1;
    today = {
      date: todayKey,
      kind: "WORKOUT",
      scheduled: mapScheduleEntry(plannedEntry),
      routine: { id: plannedEntry.routine.id, name: plannedEntry.routine.name, kind: plannedEntry.routine.kind ?? "ROUTINE" },
      day: plannedEntry.day
        ? {
            id: plannedEntry.day.id,
            name: plannedEntry.day.name,
            dayType: plannedEntry.day.dayType ?? "WORKOUT",
            index: dayIdx,
            count: active && active.routineId === plannedEntry.routineId ? active.routine.days.length : 0,
          }
        : null,
    };
  } else if (active) {
    const days = active.routine.days;
    const idx = clampCursor(active.cursorDayIndex, days.length);
    const day = days[idx];
    today = {
      date: todayKey,
      kind: (day?.dayType ?? "WORKOUT") === "REST" ? "REST" : "WORKOUT",
      scheduled: null,
      routine: { id: active.routine.id, name: active.routine.name, kind: active.routine.kind ?? "ROUTINE" },
      day: day
        ? { id: day.id, name: day.name, dayType: day.dayType ?? "WORKOUT", index: idx, count: days.length }
        : null,
    };
  } else {
    today = { date: todayKey, kind: "NONE", scheduled: null, routine: null, day: null };
  }

  // ---- upcoming strip (7 days) ----
  type EntryRow = (typeof windowEntries)[number];
  const entryByDate = new Map<string, EntryRow[]>();
  for (const e of windowEntries) {
    const k = dayKey(e.date);
    entryByDate.set(k, [...(entryByDate.get(k) ?? []), e]);
  }
  const activeDays = active ? active.routine.days.map(toProgramDay) : [];
  const projection = active
    ? projectCursor({
        days: activeDays,
        startIndex: clampCursor(active.cursorDayIndex, activeDays.length),
        todayKey,
        settings,
        count: 7,
      })
    : [];
  const upcoming = projection.map((p) => {
    const entries = (entryByDate.get(p.dateKey) ?? []).filter((e) => e.status !== "DONE");
    const entry = entries.find((e) => e.status === "PLANNED") ?? entries[0] ?? null;
    if (entry) {
      return {
        date: p.dateKey,
        kind: "SCHEDULED" as const,
        label: entry.day?.name ?? entry.routine.name,
        entry: mapScheduleEntry(entry),
      };
    }
    return {
      date: p.dateKey,
      kind: p.day.dayType === "REST" ? ("REST" as const) : ("WORKOUT" as const),
      label: p.day.name,
      entry: null,
    };
  });

  // ---- stats ----
  const weekStart = addDaysUtc(todayDate, -6);
  const weekWorkouts = await db.workout.findMany({
    where: { userId, date: { gte: weekStart, lte: todayDate } },
    include: { exercises: { include: { sets: true } } },
  });
  let weekSets = 0;
  let weekVolume = 0;
  for (const w of weekWorkouts) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (s.isComplete || s.reps != null || s.weight != null) {
          weekSets += 1;
          weekVolume += (s.weight ?? 0) * (s.reps ?? 0);
        }
      }
    }
  }

  // streak: consecutive days (ending today or yesterday) with ≥1 set
  const daysWithData = new Set<string>();
  for (const w of weekWorkouts) {
    const has = w.exercises.some((e) => e.sets.length > 0);
    if (has) daysWithData.add(dayKey(w.date));
  }
  // widen the look-back for the streak
  const streakLookback = await db.workout.findMany({
    where: { userId, date: { gte: addDaysUtc(todayDate, -180), lte: addDaysUtc(todayDate, -7) } },
    include: { exercises: { include: { sets: { take: 1 } } } },
  });
  for (const w of streakLookback) {
    if (w.exercises.some((e) => e.sets.length > 0)) daysWithData.add(dayKey(w.date));
  }
  let streakDays = 0;
  let cursorDate = daysWithData.has(todayKey) ? todayKey : addDaysKey(todayKey, -1);
  while (daysWithData.has(cursorDate) && streakDays < 366) {
    streakDays += 1;
    cursorDate = addDaysKey(cursorDate, -1);
  }

  // ---- quick sessions ----
  const sessions = (await listPrograms(userId, "SESSION")) as Array<{
    id: string;
    name: string;
    notes: string | null;
    kind: string;
    dayCount: number;
    restCount: number;
    exerciseCount: number;
    lastUsedAt: string | null;
    isFollowed: boolean;
    cursor: { dayIndex: number; dayCount: number } | null;
  }>;
  sessions.sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) return b.lastUsedAt.localeCompare(a.lastUsedAt);
    if (a.lastUsedAt) return -1;
    if (b.lastUsedAt) return 1;
    return a.name.localeCompare(b.name);
  });

  // ---- today's workout ----
  const todayWorkout = todayWorkoutRow
    ? {
        id: todayWorkoutRow.id,
        finishedAt: todayWorkoutRow.finishedAt?.toISOString() ?? null,
        setCount: todayWorkoutRow.exercises.reduce((acc, e) => acc + e.sets.length, 0),
        completedCount: todayWorkoutRow.exercises.reduce(
          (acc, e) => acc + e.sets.filter((s) => s.isComplete).length,
          0,
        ),
      }
    : null;

  return {
    today,
    active: active ? await getActiveRoutineState(userId) : null,
    upcoming,
    stats: {
      weekSets,
      weekVolume: Math.round(weekVolume * 100) / 100,
      streakDays,
      weekWorkouts: weekWorkouts.filter((w) => w.exercises.some((e) => e.sets.length > 0)).length,
      weeklyWorkoutTarget: settings.weeklyWorkoutTarget,
    },
    todayWorkout,
  };
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 6 — program metadata (§4.4/§4.5), mark-off (§4.5), totals, builder (§4.7)
// ─────────────────────────────────────────────────────────────────────────────

import { jsonStringArray } from "@/server/media";
import type { ProgramMetaDTO, ProgramTotalsDTO } from "@/lib/types";

type PhaseJson = { name: string; dayIds: string[] };

function parsePhases(raw: unknown): PhaseJson[] | null {
  if (raw == null) return null;
  const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(String(raw)); } catch { return null; } })();
  if (!Array.isArray(arr)) return null;
  const out: PhaseJson[] = [];
  for (const p of arr) {
    if (p && typeof p === "object" && typeof (p as PhaseJson).name === "string" && Array.isArray((p as PhaseJson).dayIds)) {
      out.push({ name: (p as PhaseJson).name, dayIds: (p as PhaseJson).dayIds.filter((d) => typeof d === "string") });
    }
  }
  return out;
}

async function loadOwnedRoutine(userId: string, routineId: string) {
  const routine = await db.routine.findFirst({
    where: { id: routineId, userId, deletedAt: null },
    include: { days: { orderBy: { sortOrder: "asc" } } },
  });
  if (!routine) throw notFound("Program not found");
  return routine;
}

export async function getProgramMeta(userId: string, routineId: string): Promise<ProgramMetaDTO> {
  const routine = await loadOwnedRoutine(userId, routineId);
  return {
    difficulty: routine.difficulty ?? null,
    phases: parsePhases(routine.phases),
    daysPerWeek: routine.daysPerWeek ?? null,
    estMinutes: routine.estMinutes ?? null,
    highlights: jsonStringArray(routine.highlights),
    labels: jsonStringArray(routine.labels),
    isFavorite: routine.isFavorite,
  };
}

export interface ProgramMetaPatch {
  difficulty?: string | null;
  phases?: PhaseJson[] | null;
  daysPerWeek?: number | null;
  estMinutes?: number | null;
  highlights?: string[] | null;
  labels?: string[] | null;
  isFavorite?: boolean;
}

export async function updateProgramMeta(userId: string, routineId: string, patch: ProgramMetaPatch): Promise<ProgramMetaDTO> {
  const routine = await loadOwnedRoutine(userId, routineId);
  if (patch.phases) {
    const dayIds = new Set(routine.days.map((d) => d.id));
    for (const phase of patch.phases) {
      if (phase.dayIds.some((id) => !dayIds.has(id))) throw badRequest("Phase dayIds must belong to this program");
    }
  }
  await db.routine.update({
    where: { id: routineId },
    data: {
      ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
      ...(patch.phases !== undefined ? { phases: patch.phases ? JSON.stringify(patch.phases) : null } : {}),
      ...(patch.daysPerWeek !== undefined ? { daysPerWeek: patch.daysPerWeek } : {}),
      ...(patch.estMinutes !== undefined ? { estMinutes: patch.estMinutes } : {}),
      ...(patch.highlights !== undefined ? { highlights: JSON.stringify(patch.highlights ?? []) } : {}),
      ...(patch.labels !== undefined ? { labels: JSON.stringify(patch.labels ?? []) } : {}),
      ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
    } as Prisma.RoutineUpdateInput,
  });
  return getProgramMeta(userId, routineId);
}

function readCompletedDayIds(active: { completedDayIds: unknown } | null): string[] {
  return jsonStringArray(active?.completedDayIds);
}

/**
 * POST /api/programs/:id/days/:dayId/mark-off (§4.5 DayActionRow "Mark off"):
 * adds a persistent completed marker (independent of the cursor), creates a DONE
 * ScheduleEntry for today if none exists, and advances the cursor ONLY when the
 * marked day is the cursor day (per Part 5 rules).
 */
export async function markDayOff(userId: string, routineId: string, dayId: string): Promise<{ completedDayIds: string[]; advanced: boolean }> {
  const routine = await loadOwnedRoutine(userId, routineId);
  const day = routine.days.find((d) => d.id === dayId);
  if (!day) throw notFound("Day not found");

  const active = await db.activeRoutine.findFirst({ where: { userId, routineId } });
  const completed = readCompletedDayIds(active);
  let advanced = false;
  if (!completed.includes(dayId)) {
    completed.push(dayId);
    if (active) {
      await db.activeRoutine.update({ where: { id: active.id }, data: { completedDayIds: JSON.stringify(completed) } });
    }
  }

  // DONE schedule entry for today (if none for this day)
  const settings = await getProgramSettings(userId);
  const todayKey = localDateKey(settings.timezone, new Date());
  const existing = await db.scheduleEntry.findFirst({
    where: { userId, deletedAt: null, date: toDayUtc(todayKey), dayId },
  });
  if (existing && existing.status === "PLANNED") {
    await db.scheduleEntry.update({ where: { id: existing.id }, data: { status: "DONE" } });
  } else if (!existing) {
    await db.scheduleEntry.create({
      data: {
        id: uuid7(),
        userId,
        date: toDayUtc(todayKey),
        sourceType: "ROUTINE_DAY",
        routineId,
        dayId,
        status: "DONE",
        estMinutes: day.estMinutes ?? routine.estMinutes ?? null,
      },
    });
  }

  // Cursor advance only when marking off the cursor day
  if (active && routine.days[clampCursor(active.cursorDayIndex, routine.days.length)]?.id === dayId) {
    await advanceCursorOp(userId, 1);
    advanced = true;
  }
  return { completedDayIds: completed, advanced };
}

/** DELETE /api/programs/:id/days/:dayId/mark-off — un-mark (no confirm; client toasts + Undo). */
export async function unmarkDayOff(userId: string, routineId: string, dayId: string): Promise<{ completedDayIds: string[] }> {
  const active = await db.activeRoutine.findFirst({ where: { userId, routineId } });
  const completed = readCompletedDayIds(active).filter((id) => id !== dayId);
  if (active) {
    await db.activeRoutine.update({ where: { id: active.id }, data: { completedDayIds: JSON.stringify(completed) } });
  }
  return { completedDayIds: completed };
}

/** POST /api/programs/:id/days/:dayId/favourite — toggle the day favourite flag. */
export async function toggleDayFavourite(userId: string, routineId: string, dayId: string): Promise<{ isFavorite: boolean }> {
  const routine = await loadOwnedRoutine(userId, routineId);
  const day = routine.days.find((d) => d.id === dayId);
  if (!day) throw notFound("Day not found");
  const next = !day.isFavorite;
  await db.routineDay.update({ where: { id: dayId }, data: { isFavorite: next } });
  return { isFavorite: next };
}

/**
 * GET /api/programs/:id/totals (§4.5 TotalsRow). From workouts with
 * sourceRoutineId = this program; removed workouts excluded;
 * warm-up sets excluded (acceptance: "totals excludes discarded/warmups").
 */
export async function getProgramTotals(userId: string, routineId: string): Promise<ProgramTotalsDTO> {
  await loadOwnedRoutine(userId, routineId);
  const workouts = await db.workout.findMany({
    where: { userId, sourceRoutineId: routineId, removedAt: null },
    include: { exercises: { include: { sets: true } } },
  });
  let setsLogged = 0;
  let weightLifted = 0;
  let workoutCount = 0;
  for (const w of workouts) {
    let hasQualifyingSet = false;
    for (const we of w.exercises) {
      for (const s of we.sets) {
        if (s.isWarmup || s.setType === "WARMUP") continue;
        const performed = s.isComplete || s.weight != null || s.reps != null || s.distance != null || s.timeSec != null;
        if (!performed) continue;
        setsLogged += 1;
        hasQualifyingSet = true;
        if (s.weight != null && s.reps != null) weightLifted += s.weight * s.reps;
      }
    }
    if (hasQualifyingSet) workoutCount += 1;
  }
  return { workouts: workoutCount, setsLogged, weightLifted: Math.round(weightLifted * 10) / 10 };
}

// ---------- builder (§4.7) ----------

export interface BuilderSetInput { weight?: number | null; reps?: number | null; restPlannedSec?: number | null; setType?: string | null }
export interface BuilderExerciseInput { exerciseId: string; sets?: BuilderSetInput[] }
export interface BuilderInput {
  name: string;
  difficulty?: string | null;
  daysPerWeek?: number | null;
  estMinutes?: number | null;
  labels?: string[];
  phases: Array<{ name: string; weeks: number }>;
  weekly: Array<{ weekday: number; type: string; name?: string | null }>;
  exercises?: Record<string, BuilderExerciseInput[]>;
}

/**
 * POST /api/programs/builder — generates a Routine from the 4-step builder:
 * days = phases × weeks × 7 weekly-template days (REST included), phases json
 * populated with ordered dayIds, exercises attached per named workout template.
 */
export async function buildProgram(userId: string, input: BuilderInput): Promise<{ id: string; dayCount: number }> {
  const weekly = [...input.weekly].sort((a, b) => a.weekday - b.weekday);
  if (weekly.length !== 7 || new Set(weekly.map((w) => w.weekday)).size !== 7) {
    throw badRequest("Weekly template must cover all 7 weekdays");
  }
  const templateNames = new Set<string>();
  for (const w of weekly) {
    if (w.type === "WORKOUT" && !w.name) throw badRequest("WORKOUT weekdays need a template name");
    if (w.type === "WORKOUT") templateNames.add(w.name as string);
  }

  const exerciseIds = new Set<string>();
  for (const list of Object.values(input.exercises ?? {})) {
    for (const e of list) exerciseIds.add(e.exerciseId);
  }
  if (exerciseIds.size > 0) {
    const owned = await db.exercise.findMany({ where: { userId, deletedAt: null, id: { in: [...exerciseIds] } }, select: { id: true } });
    if (owned.length !== exerciseIds.size) throw badRequest("Builder references exercises you do not own");
  }

  const routineId = uuid7();
  const phaseDays: PhaseJson[] = [];
  const dayRows: Array<{ id: string; name: string; dayType: string; templateName: string | null }> = [];
  let sortOrder = 0;
  for (const phase of input.phases) {
    const collected: string[] = [];
    for (let week = 1; week <= phase.weeks; week++) {
      for (const w of weekly) {
        const isRest = w.type === "REST";
        const id = uuid7();
        const name = isRest ? "Rest" : `${w.name}${input.phases.length > 1 ? ` · W${week}` : ""}`;
        dayRows.push({ id, name, dayType: isRest ? "REST" : "WORKOUT", templateName: isRest ? null : (w.name as string) });
        collected.push(id);
        sortOrder += 1;
      }
    }
    phaseDays.push({ name: phase.name, dayIds: collected });
  }

  const workoutCount = dayRows.filter((d) => d.dayType === "WORKOUT").length;
  if (workoutCount === 0) throw badRequest("Builder produced no workout days");

  // Single transaction: a failure mid-attach (bad exercise id, etc.) must not
  // leave a half-built program behind (verified by the §4.7 QA).
  await db.$transaction(async (tx) => {
    await tx.routine.create({
      data: {
        id: routineId,
        userId,
        name: input.name,
        kind: "ROUTINE",
        difficulty: input.difficulty ?? null,
        daysPerWeek: input.daysPerWeek ?? weekly.filter((w) => w.type === "WORKOUT").length,
        estMinutes: input.estMinutes ?? null,
        labels: JSON.stringify(input.labels ?? []),
        phases: JSON.stringify(phaseDays),
        days: {
          create: dayRows.map((d) => ({ id: d.id, userId, name: d.name, dayType: d.dayType, sortOrder: dayRows.indexOf(d) })),
        },
      },
    });

    // Attach exercises per template name (order preserved per template)
    for (const [templateName, list] of Object.entries(input.exercises ?? {})) {
      if (!templateNames.has(templateName)) continue;
      const targetDays = dayRows.filter((d) => d.templateName === templateName);
      for (const day of targetDays) {
        let exOrder = 0;
        for (const e of list) {
          const reId = uuid7();
          await tx.routineExercise.create({
            data: {
              id: reId,
              userId,
              dayId: day.id,
              exerciseId: e.exerciseId,
              sortOrder: exOrder,
              sets: {
                // PredefinedSet.id has no DB default — every nested row needs one.
                create: (e.sets ?? []).map((s, i) => ({
                  id: uuid7(),
                  weight: s.weight ?? null,
                  reps: s.reps ?? null,
                  restPlannedSec: s.restPlannedSec ?? null,
                  setType: s.setType ?? null,
                  sortOrder: i,
                })) as Prisma.PredefinedSetUncheckedCreateWithoutRoutineExerciseInput[],
              },
            },
          });
          exOrder += 1;
        }
      }
    }
  });

  return { id: routineId, dayCount: dayRows.length };
}

/** POST /api/schedule/:id/time (§4.13) — set/clear time-of-day on an entry. */
export async function setScheduleTime(userId: string, id: string, time: string | null): Promise<ReturnType<typeof mapScheduleEntry>> {
  const entry = await db.scheduleEntry.findFirst({ where: { id, userId, deletedAt: null }, include: { routine: { select: { name: true } }, day: { select: { name: true } } } });
  if (!entry) throw notFound("Schedule entry not found");
  const updated = await db.scheduleEntry.update({ where: { id }, data: { timeOfDay: time } });
  return mapScheduleEntry({ ...updated, routine: { name: entry.routine.name }, day: entry.day ? { name: entry.day.name } : null });
}
