// Zod request schemas — shared client + server. This is the validation contract.
import { z } from "zod";
import { EXERCISE_TYPES, GOAL_TYPES, GRAPH_METRICS, MEASUREMENT_GOAL_TYPES, REST_END_BEHAVIOURS, E1RM_METHODS, SET_TYPES, TEMPO_REGEX, REST_DISPLAYS, FINISH_BEHAVIOURS, CALENDAR_STYLES, DIFFICULTIES, PROFILE_LEVELS, PROFILE_GOALS, PHOTO_SLOTS, MUSCLES, EQUIPMENT } from "./constants";

// ---- Part 5 enum-ish constants (declared before use) ----
export const ROUTINE_KINDS = ["ROUTINE", "SESSION"] as const;
export const DAY_TYPES = ["WORKOUT", "REST"] as const;
export const ADVANCE_TRIGGERS = ["FINISH_OR_MIDNIGHT", "FIRST_SET"] as const;

export const emailField = z.email("Enter a valid email").transform((v) => v.trim().toLowerCase());
export const passwordField = z.string().min(8, "At least 8 characters").max(128);

// ---------- auth ----------
export const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(), // IANA tz from the browser
});
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});
export const resetRequestSchema = z.object({
  email: emailField,
});
export const resetConfirmSchema = z.object({
  token: z.string().min(20).max(128),
  newPassword: passwordField,
});

// ---------- categories ----------
export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

// ---------- exercises ----------
export const exerciseCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  categoryId: z.string().min(1),
  type: z.enum(EXERCISE_TYPES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  weightUnit: z.enum(["kg", "lbs"]).nullable().optional(),
  weightIncrement: z.number().positive().max(500).nullable().optional(),
  restSec: z.number().int().min(0).max(3600).nullable().optional(),
  defaultGraph: z.enum(GRAPH_METRICS).nullable().optional(),
  barWeight: z.number().min(0).max(1000).nullable().optional(),
  autoWarmup: z.boolean().optional(),
  // ---- Part 2: per-exercise set defaults ----
  defaultSetType: z.enum(SET_TYPES).nullable().optional(),
  defaultRpeTarget: z.number().min(6).max(10).nullable().optional(),
  defaultTempo: z
    .string()
    .regex(TEMPO_REGEX, "Tempo must look like 3-1-1-0")
    .nullable()
    .optional(),
});
export const exerciseUpdateSchema = exerciseCreateSchema.partial().extend({
  isFavorite: z.boolean().optional(),
  unitChangeMode: z.enum(["convert", "change"]).optional(), // kg↔lbs conversion on unit change
});
export const exerciseQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  favoritesOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

// ---------- workouts ----------
const isoDate = z
  .string()
  .min(8)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");
const isoDateTime = isoDate;

export const workoutCreateSchema = z.object({ date: isoDate });
export const workoutUpdateSchema = z.object({
  date: isoDate.optional(),
  comment: z.string().max(1000).nullable().optional(),
  startAt: isoDateTime.nullable().optional(),
  endAt: isoDateTime.nullable().optional(),
});
export const workoutCopySchema = z.object({
  fromDate: isoDate.optional(), // default: most recent workout strictly before target date
  setIds: z.array(z.string().min(1)).optional(), // default: all sets
});
export const workoutMoveSchema = z.object({
  toDate: isoDate,
  workoutExerciseIds: z.array(z.string().min(1)).optional(), // default: all (whole workout)
});
export const workoutExerciseAddSchema = z.object({ exerciseId: z.string().min(1) });
export const workoutExerciseUpdateSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  groupId: z.string().nullable().optional(),
});
export const orderSchema = reorderSchema;

// ---------- sets ----------
const nullableNum = (max: number) => z.number().min(0).max(max).nullable().optional();
const tempoField = z
  .string()
  .regex(TEMPO_REGEX, "Tempo must look like 3-1-1-0")
  .nullable()
  .optional();
export const setCreateSchema = z.object({
  weight: nullableNum(100000),
  reps: z.number().int().min(0).max(10000).nullable().optional(),
  distance: nullableNum(100000),
  timeSec: z.number().int().min(0).max(900000).nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
  isComplete: z.boolean().optional(),
  isWarmup: z.boolean().optional(),
  // ---- Part 2 ----
  setType: z.enum(SET_TYPES).optional(),
  rpe: z.number().min(6).max(10).nullable().optional(),
  tempo: tempoField,
  restPlannedSec: z.number().int().min(0).max(3600).nullable().optional(),
  restActualSec: z.number().int().min(0).max(3600).nullable().optional(),
  completedAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date")
    .nullable()
    .optional(),
});
export const setUpdateSchema = setCreateSchema;

// ---------- workout groups ----------
export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  exerciseIds: z.array(z.string().min(1)).optional(),
});
export const groupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

// ---------- goals ----------
const goalBaseSchema = z.object({
  exerciseId: z.string().min(1),
  type: z.enum(GOAL_TYPES),
  targetWeight: nullableNum(100000),
  targetReps: z.number().int().min(0).max(10000).nullable().optional(),
  targetDistance: nullableNum(100000),
  targetTimeSec: z.number().int().min(0).max(900000).nullable().optional(),
});
export const goalCreateSchema = goalBaseSchema.refine(
  (g) => g.targetWeight != null || g.targetReps != null || g.targetDistance != null || g.targetTimeSec != null,
  { message: "At least one target value is required" },
);
export const goalUpdateSchema = goalBaseSchema.partial().omit({ exerciseId: true });

// ---------- routines ----------
export const routineCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().max(2000).nullable().optional(),
  kind: z.enum(ROUTINE_KINDS).default("ROUTINE"),
});
export const routineUpdateSchema = routineCreateSchema.partial().extend({
  sortOrder: z.number().int().min(0).optional(),
});
export const routineDayCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dayType: z.enum(DAY_TYPES).default("WORKOUT"),
});
export const routineDayUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dayType: z.enum(DAY_TYPES).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export const routineExerciseCreateSchema = z.object({ exerciseId: z.string().min(1) });
export const routineExerciseUpdateSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  groupId: z.string().nullable().optional(),
});
export const predefinedSetCreateSchema = z.object({
  weight: nullableNum(100000),
  reps: z.number().int().min(0).max(10000).nullable().optional(),
  distance: nullableNum(100000),
  timeSec: z.number().int().min(0).max(900000).nullable().optional(),
  // ---- Part 2 template fields ----
  setType: z.enum(SET_TYPES).nullable().optional(),
  rpe: z.number().min(6).max(10).nullable().optional(),
  tempo: tempoField,
  restPlannedSec: z.number().int().min(0).max(3600).nullable().optional(),
});
export const predefinedSetUpdateSchema = predefinedSetCreateSchema;
export const routineLogSchema = z.object({ dayId: z.string().min(1), date: isoDate });

// ---------- measurements ----------
export const measurementCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  unitId: z.string().min(1),
  goalType: z.enum(MEASUREMENT_GOAL_TYPES).optional(),
  targetValue: z.number().nullable().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export const measurementUpdateSchema = z.object({
  goalType: z.enum(MEASUREMENT_GOAL_TYPES).optional(),
  targetValue: z.number().nullable().optional(),
  isEnabled: z.boolean().optional(),
  unitId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export const measurementRecordCreateSchema = z.object({
  value: z.number(),
  recordedAt: isoDateTime.optional(),
  comment: z.string().max(500).nullable().optional(),
});
export const measurementRecordUpdateSchema = z.object({
  value: z.number().optional(),
  recordedAt: isoDateTime.optional(),
  comment: z.string().max(500).nullable().optional(),
});
export const unitCreateSchema = z.object({ name: z.string().trim().min(1).max(20) });

// ---------- settings / plates / account ----------
// ---------- Part 5 settings sub-schemas (defined before use) ----------
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone");
const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM")
  .nullable();

export const settingsUpdateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  weekStart: z.number().int().min(0).max(1).optional(),
  defaultWeightIncrement: z.number().positive().max(500).optional(),
  homeSetsShown: z.number().int().min(1).max(10).optional(),
  showCategory: z.boolean().optional(),
  trackPR: z.boolean().optional(),
  markSetsComplete: z.boolean().optional(),
  autoSelectNextSet: z.boolean().optional(),
  keepScreenOn: z.boolean().optional(),
  estOneRmRepLimit: z.number().int().min(1).max(36).optional(),
  weeklyWorkoutTarget: z.number().int().min(0).max(14).optional(),
  // ---- Part 2: set-row columns & behaviour ----
  showSetType: z.boolean().optional(),
  showRpe: z.boolean().optional(),
  showTempo: z.boolean().optional(),
  showRest: z.boolean().optional(),
  autoRestFromRow: z.boolean().optional(),
  restEndBehaviour: z.enum(REST_END_BEHAVIOURS).optional(),
  e1rmMethod: z.enum(E1RM_METHODS).optional(),
  // ---- Part 5 ----
  timezone: timezoneSchema.optional(),
  autoAdvanceRest: z.boolean().optional(),
  scheduleMovesCursor: z.boolean().optional(),
  advanceTrigger: z.enum(ADVANCE_TRIGGERS).optional(),
  showProjectedDays: z.boolean().optional(),
  reminderTime: reminderTimeSchema.optional(),
  // ---- Part 6: feature expansion (defaults preserve Part 1-5 behaviour) ----
  guidedMode: z.boolean().optional(),
  restDisplay: z.enum(REST_DISPLAYS).optional(),
  autoMoveNextSet: z.boolean().optional(),
  hapticsEnabled: z.boolean().optional(),
  showVideoPanel: z.boolean().optional(),
  showMuscleChips: z.boolean().optional(),
  showEquipmentChips: z.boolean().optional(),
  finishBehaviour: z.enum(FINISH_BEHAVIOURS).optional(),
  showSetsProgressBar: z.boolean().optional(),
  showMaxWeightBar: z.boolean().optional(),
  calendarStyle: z.enum(CALENDAR_STYLES).optional(),
  tempoPresets: z.array(z.string().regex(TEMPO_REGEX, "Invalid tempo")).min(0).max(8).optional(),
  showCaloriesCard: z.boolean().optional(),
  showThumbnails: z.boolean().optional(),
});
export const platesUpdateSchema = z.object({
  unitSystem: z.enum(["metric", "imperial"]),
  plates: z
    .array(
      z.object({
        id: z.string().optional(),
        weight: z.number().positive().max(1000),
        colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        count: z.number().int().min(0).max(50),
        isAvailable: z.boolean(),
      }),
    )
    .max(30),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField,
});
export const importSchema = z.object({
  mode: z.enum(["replace", "merge"]),
  data: z.unknown(), // validated deeply by the backup service schema
});
export const statsQuerySchema = z.object({
  period: z.enum(["week", "month", "year", "all", "custom"]).default("all"),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export const graphQuerySchema = z.object({
  metric: z.enum(GRAPH_METRICS).default("EST_1RM"),
  reps: z.coerce.number().int().min(1).max(36).optional(),
  rm: z.coerce.number().int().min(1).max(15).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ---------- interval timer ----------
const timerPresetBase = z.object({
  name: z.string().trim().min(1).max(40),
  prepareSec: z.number().int().min(0).max(600),
  workSec: z.number().int().min(1).max(3600),
  restSec: z.number().int().min(0).max(1800),
  rounds: z.number().int().min(1).max(100),
});
export const timerPresetCreateSchema = timerPresetBase.extend({
  // create requires the full config; defaults apply only where omitted
  prepareSec: timerPresetBase.shape.prepareSec.default(10),
  restSec: timerPresetBase.shape.restSec.default(0),
  rounds: timerPresetBase.shape.rounds.default(8),
});
export const timerPresetUpdateSchema = timerPresetBase.partial(); // NO defaults — omitted fields stay untouched

// ---------- pagination ----------
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ===================== Part 5: programs, sessions, scheduling =====================

export const routineKindSchema = z.object({
  kind: z.enum(ROUTINE_KINDS).default("ROUTINE"),
});
export const routineDayTypeSchema = z.object({ dayType: z.enum(DAY_TYPES) });

export const programFollowSchema = z.object({
  startDayIndex: z.number().int().min(0).optional(),
});
export const cursorAdvanceSchema = z.object({ n: z.number().int().min(1).max(366).default(1) });
export const cursorJumpSchema = z.object({ dayIndex: z.number().int().min(0) });

export const startDaySchema = z.object({
  dayId: z.string().min(1).optional(), // defaults to cursor day / single session day
  date: isoDate.optional(), // defaults to local today (server timezone fallback)
});

export const scheduleCreateSchema = z.object({
  date: isoDate,
  routineId: z.string().min(1),
  dayId: z.string().min(1).optional(),
  note: z.string().max(500).nullable().optional(),
  replace: z.boolean().optional(), // destructive replace of existing PLANNED
});
export const scheduleUpdateSchema = z.object({
  date: isoDate.optional(),
  status: z.enum(["PLANNED", "SKIPPED"]).optional(), // reopen / skip; DONE only via logging
  note: z.string().max(500).nullable().optional(),
});
export const scheduleQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const sessionFromWorkoutSchema = z.object({
  workoutId: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
});


// ---------- Part 6: feature expansion ----------

const muscleList = z.array(z.enum(MUSCLES)).max(20);
const equipmentList = z.array(z.enum(EQUIPMENT)).max(21);
const labelList = z.array(z.string().trim().min(1).max(30)).max(20);

export const profilePatchSchema = z.object({
  age: z.number().int().min(10).max(100).nullish(),
  heightCm: z.number().min(50).max(260).nullish(),
  weightKg: z.number().min(20).max(400).nullish(),
  level: z.enum(PROFILE_LEVELS).nullish(),
  goal: z.enum(PROFILE_GOALS).nullish(),
  daysPerWeekTarget: z.number().int().min(0).max(7).nullish(),
});

export const onboardingCompleteSchema = z.object({
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  goal: z.enum(PROFILE_GOALS).nullish(),
  level: z.enum(PROFILE_LEVELS).nullish(),
  daysPerWeekTarget: z.number().int().min(0).max(7).nullish(),
  heightCm: z.number().min(50).max(260).nullish(), // metric cm (client converts live)
  weightKg: z.number().min(20).max(400).nullish(), // metric kg (client converts live)
  age: z.number().int().min(10).max(100).nullish(),
  skipped: z.boolean().optional(),
});

export const caloriesPutSchema = z.object({
  kcal: z.number().int().min(0).max(20000).nullable(),
  note: z.string().trim().max(200).nullable().optional(),
});

const phaseSchema = z.object({
  name: z.string().trim().min(1).max(40),
  dayIds: z.array(z.string().min(1)).max(400),
});

export const programMetaPatchSchema = z.object({
  difficulty: z.enum(DIFFICULTIES).nullish(),
  phases: z.array(phaseSchema).max(12).nullish(),
  daysPerWeek: z.number().int().min(1).max(7).nullish(),
  estMinutes: z.number().int().min(5).max(300).nullish(),
  highlights: z.array(z.string().trim().min(1).max(60)).max(4).nullish(),
  labels: labelList.nullish(),
  isFavorite: z.boolean().optional(),
});

export const scheduleTimeSchema = z.object({
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "HH:MM").nullable(),
});

export const builderSetSchema = z.object({
  weight: z.number().min(0).max(1000).nullish(),
  reps: z.number().int().min(0).max(1000).nullish(),
  restPlannedSec: z.number().int().min(0).max(900).nullish(),
  setType: z.enum(SET_TYPES).nullish(),
});
export const builderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  daysPerWeek: z.number().int().min(1).max(7).nullish(),
  estMinutes: z.number().int().min(5).max(300).nullish(),
  labels: labelList.optional(),
  phases: z.array(z.object({ name: z.string().trim().min(1).max(40), weeks: z.number().int().min(1).max(12) })).min(1).max(12),
  weekly: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    type: z.enum(DAY_TYPES),
    name: z.string().trim().min(1).max(40).nullish(),
  })).length(7),
  exercises: z.record(z.string().trim().min(1).max(40), z.array(z.object({
    exerciseId: z.string().min(1),
    sets: z.array(builderSetSchema).max(20).optional(),
  })).max(30)).optional(),
});

export const photoAttachSchema = z.object({
  slot: z.enum(PHOTO_SLOTS),
  mediaKey: z.string().min(1).max(300),
  thumbKey: z.string().min(1).max(300).optional(),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
});

export const weightTableQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(12),
  before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const exerciseCatalogPatchSchema = z.object({
  primaryMuscles: muscleList.optional(),
  secondaryMuscles: muscleList.optional(),
  equipment: equipmentList.optional(),
  trainerTip: z.string().trim().max(600).nullable().optional(),
  setupNotes: z.string().trim().max(600).nullable().optional(),
  targetNotes: z.string().trim().max(600).nullable().optional(),
});

// Auth email confirmation (AUTH_EMAIL_CONFIRM=true)
export const resendConfirmationSchema = z.object({ email: emailField });
export const confirmEmailSchema = z.object({ token: z.string().min(16).max(128) });
