// Shared DTO types — the contract between API routes and the client.
// All dates are ISO strings over the wire. Workout `date` is UTC-midnight ISO.

export type UserDTO = { id: string; email: string; name: string | null };

export type SettingsDTO = {
  theme: string;
  unitSystem: string;
  weekStart: number;
  defaultWeightIncrement: number;
  homeSetsShown: number;
  showCategory: boolean;
  trackPR: boolean;
  markSetsComplete: boolean;
  autoSelectNextSet: boolean;
  keepScreenOn: boolean;
  estOneRmRepLimit: number;
  weeklyWorkoutTarget: number;
  // ---- Part 2 ----
  showSetType: boolean;
  showRpe: boolean;
  showTempo: boolean;
  showRest: boolean;
  autoRestFromRow: boolean;
  restEndBehaviour: string; // NOTIFY | NOTIFY_AND_FOCUS_NEXT
  e1rmMethod: string; // BRZYCKI | RPE | EPLEY
  // ---- Part 5: programs, sessions, scheduling ----
  timezone: string; // IANA tz
  autoAdvanceRest: boolean;
  scheduleMovesCursor: boolean;
  advanceTrigger: string; // FINISH_OR_MIDNIGHT | FIRST_SET
  showProjectedDays: boolean;
  reminderTime: string | null; // "HH:MM" or null = off
};

export type SessionDTO = { user: UserDTO; settings: SettingsDTO };

export type CategoryDTO = {
  id: string;
  name: string;
  colour: string;
  sortOrder: number;
  exerciseCount?: number;
};

export type ExerciseDTO = {
  id: string;
  name: string;
  categoryId: string;
  category?: Pick<CategoryDTO, "name" | "colour"> | null;
  notes: string | null;
  type: string;
  weightUnit: string | null;
  weightIncrement: number | null;
  restSec: number | null;
  defaultGraph: string | null;
  isFavorite: boolean;
  barWeight: number | null;
  autoWarmup: boolean;
  // ---- Part 2: per-exercise set defaults ----
  defaultSetType: string | null;
  defaultRpeTarget: number | null;
  defaultTempo: string | null;
  workoutCount?: number;
  lastPerformed?: string | null;
};

// ---------- interval timer ----------

export type TimerPresetDTO = {
  id: string;
  name: string;
  prepareSec: number;
  workSec: number;
  restSec: number;
  rounds: number;
  sortOrder: number;
};

export type SetDTO = {
  id: string;
  workoutExerciseId: string;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
  comment: string | null;
  isComplete: boolean;
  isWarmup?: boolean;
  sortOrder: number;
  newPr?: boolean;
  // ---- Part 2 set fields ----
  setType?: string; // NORMAL | WARMUP | DROP | FAILURE | AMRAP
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
  restActualSec?: number | null;
  completedAt?: string | null;
};

export type WorkoutGroupDTO = {
  id: string;
  name: string;
  colour: string;
};

export type WorkoutExerciseDTO = {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  groupId: string | null;
  exercise: ExerciseDTO;
  sets: SetDTO[];
};

export type WorkoutDTO = {
  id: string;
  date: string;
  comment: string | null;
  startAt: string | null;
  endAt: string | null;
  // ---- Part 5: provenance ----
  sourceType: string; // ROUTINE_DAY | SESSION | FREESTYLE | COPY
  sourceRoutineId: string | null;
  sourceDayId: string | null;
  scheduledStart: boolean;
  finishedAt: string | null;
  exercises: WorkoutExerciseDTO[];
  groups: WorkoutGroupDTO[];
};

export type WorkoutSummaryDTO = {
  id: string;
  date: string;
  comment: string | null;
  exerciseCount: number;
  setCount: number;
  volume: number;
  durationSec: number;
  distance: number;
  categories: Array<{ name: string; colour: string }>;
};

export type RecordRowDTO = {
  reps: number;
  weight: number;
  date: string;
  superseded: boolean;
  setCount: number;
};

export type RecordsDTO = {
  exerciseId: string;
  actual: RecordRowDTO[];
  estimatedOneRm: number;
  estimated: Array<{ reps: number; weight: number }>;
};

export type GraphPointDTO = {
  date: string;
  value: number;
  prev?: number | null;
  next?: number | null;
};

export type GraphDTO = {
  exerciseId: string;
  metric: string;
  points: GraphPointDTO[];
};

export type GoalDTO = {
  id: string;
  exerciseId: string;
  exercise?: Pick<ExerciseDTO, "id" | "name"> | null;
  type: string;
  targetWeight: number | null;
  targetReps: number | null;
  targetDistance: number | null;
  targetTimeSec: number | null;
  current: number | null;
  target: number;
  pct: number;
  achieved: boolean;
};

export type PredefinedSetDTO = {
  id: string;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  timeSec: number | null;
  sortOrder: number;
  // ---- Part 2 template fields ----
  setType?: string | null;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
};

export type RoutineExerciseDTO = {
  id: string;
  dayId: string;
  exerciseId: string;
  sortOrder: number;
  groupId: string | null;
  exercise: ExerciseDTO;
  sets: PredefinedSetDTO[];
};

export type RoutineDayDTO = {
  id: string;
  routineId: string;
  name: string;
  dayType: string; // WORKOUT | REST
  sortOrder: number;
  exercises: RoutineExerciseDTO[];
};

export type RoutineDTO = {
  id: string;
  name: string;
  notes: string | null;
  kind: string; // ROUTINE | SESSION
  sortOrder: number;
  days: RoutineDayDTO[];
};

export type MeasurementDTO = {
  id: string;
  name: string;
  unitId: string;
  unit: { id: string; name: string };
  goalType: string;
  targetValue: number | null;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  isCustom: boolean;
  lastValue: number | null;
  lastRecordedAt: string | null;
  prevValue: number | null;
};

export type MeasurementRecordDTO = {
  id: string;
  measurementId: string;
  value: number;
  recordedAt: string;
  comment: string | null;
};

export type UnitDTO = { id: string; name: string; isCustom: boolean };

export type PlateDTO = {
  id: string;
  weight: number;
  colour: string;
  count: number;
  isAvailable: boolean;
  unitSystem: string;
  sortOrder: number;
};

export type StatsPerExerciseDTO = {
  exerciseId: string;
  name: string;
  categoryColour?: string;
  setCount: number;
  volume: number;
  reps: number;
};

export type StatsDTO = {
  period: string;
  from: string | null;
  to: string | null;
  workouts: number;
  setCount: number;
  volume: number;
  reps: number;
  durationSec: number;
  distance: number;
  maxWeight: { value: number; date: string; exerciseName: string } | null;
  maxVolumeDay: { value: number; date: string } | null;
  perExercise: StatsPerExerciseDTO[];
  workoutDates: string[];
  streak: { current: number; longest: number };
};

export type HistoryEntryDTO = {
  date: string;
  workoutId: string;
  exercises: Array<{
    workoutExerciseId: string;
    exerciseId: string;
    name: string;
    categoryColour?: string;
    sets: SetDTO[];
  }>;
};

export type BackupDTO = {
  app: string;
  version: number;
  exportedAt: string;
  user: { email: string; name: string | null };
  settings: SettingsDTO;
  categories: CategoryDTO[];
  exercises: ExerciseDTO[];
  workouts: Array<{
    date: string;
    comment: string | null;
    startAt: string | null;
    endAt: string | null;
    groups: WorkoutGroupDTO[];
    exercises: Array<{
      exerciseName: string;
      sortOrder: number;
      groupName: string | null;
      sets: Array<Pick<SetDTO, "weight" | "reps" | "distance" | "timeSec" | "comment" | "isComplete" | "sortOrder">>;
    }>;
  }>;
  routines: Array<{
    name: string;
    notes: string | null;
    sortOrder: number;
    days: Array<{
      name: string;
      sortOrder: number;
      groups: Array<{ name: string; colour: string; exerciseNames: string[] }>;
      exercises: Array<{
        exerciseName: string;
        sortOrder: number;
        groupName: string | null;
        sets: Array<Pick<PredefinedSetDTO, "weight" | "reps" | "distance" | "timeSec" | "sortOrder">>;
      }>;
    }>;
  }>;
  measurements: Array<{
    name: string;
    unitName: string;
    goalType: string;
    targetValue: number | null;
    isEnabled: boolean;
    isDefault: boolean;
    sortOrder: number;
    records: Array<{ value: number; recordedAt: string; comment: string | null }>;
  }>;
  plates: PlateDTO[];
  goals: Array<{
    exerciseName: string;
    type: string;
    targetWeight: number | null;
    targetReps: number | null;
    targetDistance: number | null;
    targetTimeSec: number | null;
  }>;
};

// ===================== Part 5: Programs, Sessions, Scheduling =====================

export type ScheduleEntryDTO = {
  id: string;
  date: string; // YYYY-MM-DD
  sourceType: string; // ROUTINE_DAY | SESSION
  routineId: string;
  dayId: string | null;
  routineName: string;
  dayName: string | null;
  status: string; // PLANNED | DONE | SKIPPED | MISSED (lazily derived)
  workoutId: string | null;
  note: string | null;
};

/** Ghost "projected" day for the calendar (showProjectedDays setting). */
export type ProjectedDayDTO = {
  date: string; // YYYY-MM-DD
  routineId: string;
  dayId: string;
  dayName: string;
  dayType: string; // WORKOUT | REST
};

export type ActiveRoutineDTO = {
  routineId: string;
  routineName: string;
  routineKind: string;
  cursorDayIndex: number;
  dayCount: number;
  dayId: string;
  dayName: string;
  dayType: string; // WORKOUT | REST
  startedAt: string;
};

/** One row in the programs list with follow/usage metadata. */
export type ProgramSummaryDTO = {
  id: string;
  name: string;
  notes: string | null;
  kind: string; // ROUTINE | SESSION
  dayCount: number;
  restCount: number;
  exerciseCount: number;
  lastUsedAt: string | null; // ISO date of last provenance workout
  isFollowed: boolean;
  cursor?: { dayIndex: number; dayCount: number } | null;
};

export type DashboardTodayDTO = {
  date: string; // YYYY-MM-DD local
  kind: "WORKOUT" | "REST" | "NONE";
  scheduled: ScheduleEntryDTO | null; // today's PLANNED entry (if any)
  routine: { id: string; name: string; kind: string } | null;
  day: { id: string; name: string; dayType: string; index: number; count: number } | null;
};

export type DashboardUpcomingDayDTO = {
  date: string; // YYYY-MM-DD
  kind: "SCHEDULED" | "WORKOUT" | "REST" | "NONE";
  label: string | null; // scheduled name or projected day name
  entry: ScheduleEntryDTO | null;
};

export type DashboardDTO = {
  today: DashboardTodayDTO;
  active: ActiveRoutineDTO | null;
  upcoming: DashboardUpcomingDayDTO[];
  stats: {
    weekSets: number;
    weekVolume: number;
    streakDays: number;
    weekWorkouts: number;
    weeklyWorkoutTarget: number;
  };
  quickSessions: ProgramSummaryDTO[];
  todayWorkout: {
    id: string;
    finishedAt: string | null;
    setCount: number;
    completedCount: number;
  } | null;
};
