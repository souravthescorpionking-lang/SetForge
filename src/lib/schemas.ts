// Zod request schemas — shared client + server. This is the validation contract.
import { z } from "zod";
import { EXERCISE_TYPES, GOAL_TYPES, GRAPH_METRICS, MEASUREMENT_GOAL_TYPES } from "./constants";

export const emailField = z.email("Enter a valid email").transform((v) => v.trim().toLowerCase());
export const passwordField = z.string().min(8, "At least 8 characters").max(128);

// ---------- auth ----------
export const signupSchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1).max(80).optional(),
});
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
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
export const setCreateSchema = z.object({
  weight: nullableNum(100000),
  reps: z.number().int().min(0).max(10000).nullable().optional(),
  distance: nullableNum(100000),
  timeSec: z.number().int().min(0).max(900000).nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
  isComplete: z.boolean().optional(),
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
});
export const routineUpdateSchema = routineCreateSchema.partial().extend({
  sortOrder: z.number().int().min(0).optional(),
});
export const routineDayCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const routineDayUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
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

// ---------- pagination ----------
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
