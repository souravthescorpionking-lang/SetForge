// Shared DTO types — the contract between API routes and the client.
// All dates are ISO strings over the wire. Workout `date` is UTC-midnight ISO.

export type UserDTO = { id: string; email: string; name: string | null; difficulty: string };

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
  // ---- Part 6: feature expansion ----
  guidedMode: boolean;
  restDisplay: string; // BAR | RING
  autoMoveNextSet: boolean;
  hapticsEnabled: boolean;
  showVideoPanel: boolean;
  showMuscleChips: boolean;
  showEquipmentChips: boolean;
  finishBehaviour: string; // ALWAYS_SAVE | ASK
  showSetsProgressBar: boolean;
  showMaxWeightBar: boolean;
  calendarStyle: string; // GRID | SCROLL
  tempoPresets: string[];
  showThumbnails: boolean;
  // ---- Part 7: tour system ----
  showTours: boolean;
  showHints: boolean;
  replayToursOnUpdate: boolean;
  // ---- Part 8 ----
  preset: string; // SIMPLE | STANDARD | POWER
  sessionMode: string; // AUTO | GUIDED | FREE
  defaultTransitionRestSec: number;
  notifScheduled: boolean;
  notifMissedDay: boolean;
  notifPr: boolean;
};

// ---- Part 7: tour system ----

/** Outcome of one screen tour. "SEEN" marks a tour as visited without completing it. */
export type TourStatus = "SEEN" | "SKIPPED" | "COMPLETED";

/** Last recorded outcome of a screen's tour (screenId = route name or "__welcome"). */
export type TourStateDTO = {
  screenId: string;
  version: string;
  status: TourStatus;
  stepReached: number;
  updatedAt: string;
};

/** A dismissed contextual hint (hintId = step id with hint: true). */
export type TourHintStateDTO = { hintId: string; seenAt: string };

export type ToursStateResponseDTO = { states: TourStateDTO[]; hints: TourHintStateDTO[] };

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
  // ---- Part 6: catalog metadata ----
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string[];
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  trainerTip?: string | null;
  setupNotes?: string | null;
  targetNotes?: string | null;
  catalogKey?: string | null;
  // ---- Part 9 §1/§5.3 ----
  position?: string | null;
  altGroup?: string | null;
  // ---- Part 8 ----
  showRpe: boolean;
  showTempo: boolean;
  showRest: boolean;
  transitionRestSec: number | null;
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
  // ---- Part 9 §1/§8: Log provenance ----
  sourceLabel: string | null; // PROGRAM "{program} · Day" · ON_DEMAND "On demand" · CUSTOM "Custom"
  difficulty: string | null; // user difficulty at start; immutable
  durationSec: number | null; // active seconds (set on finish; 0 = marked off)
  // ---- Part 8 §6.9: single remove semantics ----
  removedAt: string | null;
  removeReason: string | null;
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
  // ---- Part 9 §8: list rows carry the log's identity ----
  sourceType: string;
  sourceLabel: string | null;
  difficulty: string | null;
  dayId: string | null;
  startAt: string | null;
  finishedAt: string | null;
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
  // ---- Part 8 §6.4: weight prescription ----
  weightKind?: "FIXED" | "COPY_LAST" | "PERCENT_1RM" | null;
  pct?: number | null;
  // ---- Part 9 §1 ----
  isAmrap?: boolean;
};

export type RoutineExerciseDTO = {
  id: string;
  dayId: string;
  exerciseId: string;
  sortOrder: number;
  groupId: string | null;
  exercise: ExerciseDTO;
  sets: PredefinedSetDTO[];
  // ---- Part 8 §6.2: warm-up scheme ----
  warmupScheme?: "NONE" | "STANDARD" | "LIGHT" | "CUSTOM" | null;
  // ---- Part 9 §1 ----
  tip?: string | null;
  restNone?: boolean;
};

export type RoutineDayDTO = {
  id: string;
  routineId: string;
  name: string;
  dayType: string; // WORKOUT | REST
  sortOrder: number;
  exercises: RoutineExerciseDTO[];
  // ---- Part 6 ----
  primaryMuscles?: string[];
  estMinutes?: number | null;
  isFavorite?: boolean;
  // ---- Part 9 §1 ----
  equipment?: string[];
};

export type RoutinePhaseDTO = { name: string; dayIds: string[] };

// ---------- Part 9 §5: Day Overview (override-merged) ----------

/** One SeriesExercise of a day with the user's DayOverride merged in:
 *  `exercise` carries the REPLACEMENT's data when replaced (sets stay from the
 *  original template row); `note` is DayOverride.notes[reId]. */
export type DayExerciseDTO = RoutineExerciseDTO & {
  /** Per-exercise coaching note (DayOverride.notes[reId]). */
  note?: string | null;
  /** Template exercise id when a replacement is applied (else null). */
  replacedExerciseId?: string | null;
};

/** One series (group) of the effective day: code/label recomputed by size. */
export type DaySeriesDTO = {
  key: string;
  /** Group letter ("A"). */
  code: string;
  /** "" | "Superset" | "Triset" | "Giant set". */
  label: string;
  size: number;
  exercises: DayExerciseDTO[];
};

/** GET /api/days/:id — the §5 Day Overview payload. */
export type DayDetailDTO = {
  id: string;
  routineId: string;
  name: string;
  dayType: string; // WORKOUT | REST
  sortOrder: number;
  primaryMuscles: string[];
  equipment: string[];
  estMinutes: number | null;
  isFavorite: boolean;
  setsCount: number;
  exercisesCount: number;
  routine: { id: string; name: string; kind: string; tagline: string | null; estMinutes: number | null };
  phase: { id: string; name: string; idx: number } | null;
  isCurrentProgramDay: boolean;
  /** Effective series (override-merged), in order. */
  series: DaySeriesDTO[];
  /** Flat effective exercise list (override-merged), in order. */
  exercises: DayExerciseDTO[];
  /** The user's raw override payload (client-side merge base for §5.1/5.2/5.4). */
  override: {
    seriesOrder?: string[][] | null;
    replacements?: Record<string, string> | null;
    notes?: Record<string, string> | null;
  } | null;
};

/** GET /api/exercises/:id/suggestions — §5.2 replace candidates. */
export type ExerciseSuggestionDTO = {
  id: string;
  name: string;
  primaryMuscles: string[];
  equipment: string[];
  altGroup: string | null;
  thumbnailUrl: string | null;
};

export type RoutineDTO = {
  id: string;
  name: string;
  notes: string | null;
  kind: string; // ROUTINE | SESSION
  sortOrder: number;
  days: RoutineDayDTO[];
  // ---- Part 6: program metadata ----
  difficulty?: string | null;
  phases?: RoutinePhaseDTO[] | null;
  daysPerWeek?: number | null;
  estMinutes?: number | null;
  highlights?: string[];
  isFavorite?: boolean;
  labels?: string[];
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
  // ---- Part 6 ----
  profile?: {
    age: number | null; heightCm: number | null; weightKg: number | null;
    level: string | null; goal: string | null; daysPerWeekTarget: number | null;
  } | null;
  photos?: Array<{ measurementName: string; recordDate: string; slot: string; mediaKey: string; width: number; height: number }>;
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
  // ---- Part 6 ----
  timeOfDay?: string | null; // "HH:MM"
  estMinutes?: number | null;
  missedAt?: string | null;
  // ---- Part 9 §6: dots + REST entries ----
  dayType?: string | null; // WORKOUT | REST (REST entries render no dot)
  markedOff?: boolean; // completed without training (§5 Mark off)
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
  completedDayIds?: string[]; // Part 6: persistent "Day completed" markers
};

/** One row in the programs list with follow/usage metadata.
 *  Part 9 §3: the list is the variant-aware CATALOG — every row also carries
 *  the variant facts at the requested difficulty (default = the user's).
 *  `dayCount`/`restCount`/`exerciseCount` are variant-scoped for ROUTINE rows
 *  (routine-scoped when no variant exists at that difficulty / for SESSIONs). */
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
  // ---- Part 9 §3: catalog fields at the requested difficulty ----
  tagline: string | null;
  weeks: number | null;
  daysDone: number; // completed days (current program only; 0 otherwise)
  variantExists: boolean; // a variant exists at the requested difficulty
  phaseCount: number; // variant phase count (0 when the variant is missing)
  daysPerWeek: number | null;
};

// ---------- Part 9 §4: variant-aware program detail ----------

export type ProgramDetailDayDTO = {
  id: string;
  name: string;
  dayType: string; // WORKOUT | REST
  estMinutes: number | null;
};

export type ProgramDetailPhaseDTO = {
  id: string; // ProgramPhase id ("{routineId}:implicit" for variant-less programs)
  idx: number;
  name: string;
  overview: string | null;
  minutesMin: number | null;
  minutesMax: number | null;
  hasPhaseOverride: boolean; // a per-user PhaseOverride exists (Reset Order)
  isImplicit: boolean; // synthesized phase for variant-less custom programs
  days: ProgramDetailDayDTO[]; // effective order (PhaseOverride applied)
};

export type ProgramVariantDetailDTO = {
  id: string;
  difficulty: string; // BEGINNER | INTERMEDIATE | ADVANCED
  daysPerWeek: number | null;
  equipment: string[]; // Equipment enum values
  phases: ProgramDetailPhaseDTO[];
};

export type ProgramDetailDTO = {
  id: string;
  name: string;
  notes: string | null;
  kind: string; // ROUTINE | SESSION
  tagline: string | null;
  description: string | null;
  weeks: number | null;
  highlights: string[];
  userDifficulty: string; // difficulty the DTO was resolved at
  routineDifficulty: string | null;
  variants: ProgramVariantDetailDTO[]; // every variant (empty for custom programs)
  variant: ProgramVariantDetailDTO | null; // exact match at userDifficulty
  fallbackVariant: ProgramVariantDetailDTO | null; // variantForDifficulty resolution
  isCurrent: boolean;
  cursorPhaseIdx: number | null; // current program only
  cursorDayIndex: number | null; // current program only
  daysDone: number; // current program only; 0 otherwise
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
  todayWorkout: {
    id: string;
    finishedAt: string | null;
    setCount: number;
    completedCount: number;
  } | null;
};

// ---------- Part 6: library, profile, dictionary, weight table ----------

export type LibraryEntryDTO = {
  key: string;
  name: string;
  category: string;
  type: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  setupNotes: string | null;
  targetNotes: string | null;
  trainerTip: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  adopted: boolean;
  exerciseId: string | null;
  isFavorite: boolean;
};

export type UserProfileDTO = {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  level: string | null;
  goal: string | null;
  daysPerWeekTarget: number | null;
  onboardingCompletedAt: string | null;
};

export type DictionaryTermDTO = {
  term: string;
  definition: string;
  setforge?: string; // "Used in SetForge as: …"
};

export type ProgramMetaDTO = {
  difficulty: string | null;
  phases: Array<{ name: string; dayIds: string[] }> | null;
  daysPerWeek: number | null;
  estMinutes: number | null;
  highlights: string[];
  labels: string[];
  isFavorite: boolean;
};

export type ProgramTotalsDTO = {
  workouts: number;
  setsLogged: number;
  weightLifted: number; // kg
};

export type ProgressPhotoDTO = {
  id: string;
  slot: string; // FRONT | BACK | LEFT | RIGHT
  mediaKey: string;
  thumbKey?: string | null;
  width: number;
  height: number;
  createdAt: string;
  recordId: string;
  recordDate: string;
};

export type WeightTableDTO = {
  exerciseId: string;
  columns: Array<{ date: string; label: string }>; // newest first, ≤ limit
  rows: Array<{
    setIndex: number;
    cells: Array<{ date: string; weight: number | null; reps: number | null; isBest: boolean } | null>;
  }>;
  hasMore: boolean;
};

export type RemovedWorkoutDTO = {
  id: string;
  date: string;
  comment: string | null;
  removedAt: string | null;
  removeReason: string | null;
  exerciseCount: number;
};

export type MediaUploadResultDTO = {
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  mime: string;
  url: string | null;
  thumbUrl: string | null;
};
