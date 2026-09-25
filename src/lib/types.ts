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
  workoutCount?: number;
  lastPerformed?: string | null;
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
  sortOrder: number;
  exercises: RoutineExerciseDTO[];
};

export type RoutineDTO = {
  id: string;
  name: string;
  notes: string | null;
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
