// DB row → DTO mappers (ISO strings over the wire).
import type {
  CategoryDTO,
  ExerciseDTO,
  SetDTO,
  WorkoutDTO,
  WorkoutExerciseDTO,
  WorkoutGroupDTO,
  WorkoutSummaryDTO,
  RoutineDTO,
  RoutineDayDTO,
  RoutineExerciseDTO,
  PredefinedSetDTO,
  MeasurementDTO,
  MeasurementRecordDTO,
  PlateDTO,
  GoalDTO,
  RecordsDTO,
} from "@/lib/types";
import { estOneRm } from "@/lib/formulas";
import { dayKey } from "@/lib/dates";
import type {
  Category,
  Exercise,
  TrainingSet,
  Workout,
  WorkoutExercise,
  WorkoutGroup,
  Routine,
  RoutineDay,
  RoutineExercise,
  PredefinedSet,
  Measurement,
  MeasurementRecord,
  Plate,
  Goal,
  PersonalRecord,
  TrainingSet as SetRow,
} from "@prisma/client";

type ExerciseWithCategory = Exercise & { category: Category | null };

export function mapCategory(c: Category, exerciseCount?: number): CategoryDTO {
  return { id: c.id, name: c.name, colour: c.colour, sortOrder: c.sortOrder, ...(exerciseCount !== undefined ? { exerciseCount } : {}) };
}

export function mapExercise(
  e: ExerciseWithCategory,
  extras?: { workoutCount?: number; lastPerformed?: string | null },
): ExerciseDTO {
  return {
    id: e.id,
    name: e.name,
    categoryId: e.categoryId,
    category: e.category ? { name: e.category.name, colour: e.category.colour } : null,
    notes: e.notes,
    type: e.type,
    weightUnit: e.weightUnit,
    weightIncrement: e.weightIncrement,
    restSec: e.restSec,
    defaultGraph: e.defaultGraph,
    isFavorite: e.isFavorite,
    barWeight: e.barWeight,
    autoWarmup: e.autoWarmup,
    ...extras,
  };
}

export function mapSet(s: TrainingSet, newPr?: boolean): SetDTO {
  return {
    id: s.id,
    workoutExerciseId: s.workoutExerciseId,
    weight: s.weight ?? null,
    reps: s.reps ?? null,
    distance: s.distance ?? null,
    timeSec: s.timeSec ?? null,
    comment: s.comment ?? null,
    isComplete: s.isComplete,
    isWarmup: s.isWarmup,
    sortOrder: s.sortOrder,
    ...(newPr !== undefined ? { newPr } : {}),
  };
}

export function mapWorkout(w: Workout & { exercises: Array<WorkoutExercise & { exercise: ExerciseWithCategory; sets: TrainingSet[] }>; groups: WorkoutGroup[] }): WorkoutDTO {
  return {
    id: w.id,
    date: w.date.toISOString(),
    comment: w.comment ?? null,
    startAt: w.startAt?.toISOString() ?? null,
    endAt: w.endAt?.toISOString() ?? null,
    groups: w.groups.map(mapGroup),
    exercises: w.exercises
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (we): WorkoutExerciseDTO => ({
          id: we.id,
          workoutId: we.workoutId,
          exerciseId: we.exerciseId,
          sortOrder: we.sortOrder,
          groupId: we.groupId ?? null,
          exercise: mapExercise(we.exercise),
          sets: we.sets
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => mapSet(s)),
        }),
      ),
  };
}

export function mapGroup(g: WorkoutGroup): WorkoutGroupDTO {
  return { id: g.id, name: g.name, colour: g.colour };
}

export function mapWorkoutSummary(
  w: Workout & {
    exercises: Array<WorkoutExercise & { exercise: ExerciseWithCategory; sets: TrainingSet[] }>;
  },
): WorkoutSummaryDTO {
  let volume = 0;
  let setCount = 0;
  let distance = 0;
  const cats = new Map<string, { name: string; colour: string }>();
  const seenEx = new Set<string>();
  for (const we of w.exercises) {
    if (!seenEx.has(we.exerciseId)) {
      seenEx.add(we.exerciseId);
      if (we.exercise.category) cats.set(we.exercise.category.id, { name: we.exercise.category.name, colour: we.exercise.category.colour });
    }
    for (const s of we.sets) {
      if (!s.isComplete || s.isWarmup) continue; // planned/blank sets are not performed work; warm-up ramp tonnage is excluded too
      setCount++;
      volume += (s.weight ?? 0) * (s.reps ?? 0);
      distance += s.distance ?? 0;
    }
  }
  const durationSec =
    w.startAt && w.endAt ? Math.max(0, Math.round((w.endAt.getTime() - w.startAt.getTime()) / 1000)) : 0;
  return {
    id: w.id,
    date: w.date.toISOString(),
    comment: w.comment ?? null,
    exerciseCount: seenEx.size,
    setCount,
    volume,
    durationSec,
    distance,
    categories: [...cats.values()],
  };
}

export function mapPredefinedSet(s: PredefinedSet): PredefinedSetDTO {
  return {
    id: s.id,
    weight: s.weight ?? null,
    reps: s.reps ?? null,
    distance: s.distance ?? null,
    timeSec: s.timeSec ?? null,
    sortOrder: s.sortOrder,
  };
}

export function mapRoutineExercise(re: RoutineExercise & { exercise: ExerciseWithCategory; sets: PredefinedSet[] }): RoutineExerciseDTO {
  return {
    id: re.id,
    dayId: re.dayId,
    exerciseId: re.exerciseId,
    sortOrder: re.sortOrder,
    groupId: re.groupId ?? null,
    exercise: mapExercise(re.exercise),
    sets: re.sets.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(mapPredefinedSet),
  };
}

export function mapRoutineDay(d: RoutineDay & { exercises: Array<RoutineExercise & { exercise: ExerciseWithCategory; sets: PredefinedSet[] }> }): RoutineDayDTO {
  return {
    id: d.id,
    routineId: d.routineId,
    name: d.name,
    sortOrder: d.sortOrder,
    exercises: d.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(mapRoutineExercise),
  };
}

export function mapRoutine(r: Routine & { days: Array<RoutineDay & { exercises: Array<RoutineExercise & { exercise: ExerciseWithCategory; sets: PredefinedSet[] }> }> }): RoutineDTO {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    sortOrder: r.sortOrder,
    days: r.days.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(mapRoutineDay),
  };
}

export function mapMeasurement(
  m: Measurement & { unit: { id: string; name: string } },
  records?: MeasurementRecord[],
): MeasurementDTO {
  const sorted = (records ?? []).slice().sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  const last = sorted[0];
  return {
    id: m.id,
    name: m.name,
    unitId: m.unitId,
    unit: m.unit,
    goalType: m.goalType,
    targetValue: m.targetValue ?? null,
    isEnabled: m.isEnabled,
    isDefault: m.isDefault,
    sortOrder: m.sortOrder,
    isCustom: !["Body Weight", "Body Fat", "Neck", "Shoulders", "Chest", "Left Bicep", "Right Bicep", "Left Forearm", "Right Forearm", "Waist", "Hips", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf"].includes(m.name),
    lastValue: last?.value ?? null,
    lastRecordedAt: last?.recordedAt.toISOString() ?? null,
    prevValue: sorted[1]?.value ?? null,
  };
}

export function mapMeasurementRecord(r: MeasurementRecord): MeasurementRecordDTO {
  return {
    id: r.id,
    measurementId: r.measurementId,
    value: r.value,
    recordedAt: r.recordedAt.toISOString(),
    comment: r.comment ?? null,
  };
}

export function mapPlate(p: Plate): PlateDTO {
  return {
    id: p.id,
    weight: p.weight,
    colour: p.colour,
    count: p.count,
    isAvailable: p.isAvailable,
    unitSystem: p.unitSystem,
    sortOrder: p.sortOrder,
  };
}

export function mapGoal(g: Goal & { exercise?: { id: string; name: string } | null }): GoalDTO {
  return {
    id: g.id,
    exerciseId: g.exerciseId,
    exercise: g.exercise ? { id: g.exercise.id, name: g.exercise.name } : null,
    type: g.type,
    targetWeight: g.targetWeight ?? null,
    targetReps: g.targetReps ?? null,
    targetDistance: g.targetDistance ?? null,
    targetTimeSec: g.targetTimeSec ?? null,
    current: null,
    target: 0,
    pct: 0,
    achieved: false,
  };
}

/** Actual records with supersession: a record is superseded when a LATER set did ≥ reps at ≥ weight. */
export function mapRecords(
  exerciseId: string,
  prs: Array<PersonalRecord & { set?: SetRow | null }>,
  allSets: Array<{ reps: number | null; weight: number | null; createdAt: Date; workoutDate?: Date }>,
  repLimit: number,
): RecordsDTO {
  const actual = prs
    .slice()
    .sort((a, b) => b.reps - a.reps)
    .map((pr) => {
      const superseded = allSets.some(
        (s) =>
          s.reps != null &&
          s.weight != null &&
          s.reps >= pr.reps &&
          s.weight > pr.weight &&
          (s.workoutDate ?? s.createdAt).getTime() >= pr.date.getTime(),
      );
      return {
        reps: pr.reps,
        weight: pr.weight,
        date: pr.date.toISOString(),
        superseded,
        setCount: allSets.filter((s) => s.reps === pr.reps && s.weight === pr.weight).length,
      };
    });

  let oneRm = 0;
  for (const s of allSets) {
    if (s.weight != null && s.reps != null && s.reps >= 1 && s.reps <= repLimit) {
      oneRm = Math.max(oneRm, estOneRm(s.weight, s.reps));
    }
  }
  const estimated: Array<{ reps: number; weight: number }> = [];
  if (oneRm > 0) {
    for (let n = 1; n <= Math.min(repLimit, 15); n++) {
      estimated.push({ reps: n, weight: Math.round((oneRm * (37 - n)) / 36 * 100) / 100 });
    }
  }
  return { exerciseId, actual, estimatedOneRm: Math.round(oneRm * 100) / 100, estimated };
}

export function graphPointDayKey(date: Date | string): string {
  return dayKey(date);
}
