// Domain constants + enums (SQLite stores enums as strings; validated app-side via Zod).

export const EXERCISE_TYPES = [
  "WEIGHT_REPS",
  "DISTANCE_TIME",
  "WEIGHT_DISTANCE",
  "WEIGHT_TIME",
  "REPS_DISTANCE",
  "REPS_TIME",
  "WEIGHT",
  "REPS",
  "DISTANCE",
  "TIME",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export type SetField = "weight" | "reps" | "distance" | "timeSec";

/** Which set fields apply per exercise type. */
export const FIELDS_BY_TYPE: Record<ExerciseType, SetField[]> = {
  WEIGHT_REPS: ["weight", "reps"],
  DISTANCE_TIME: ["distance", "timeSec"],
  WEIGHT_DISTANCE: ["weight", "distance"],
  WEIGHT_TIME: ["weight", "timeSec"],
  REPS_DISTANCE: ["reps", "distance"],
  REPS_TIME: ["reps", "timeSec"],
  WEIGHT: ["weight"],
  REPS: ["reps"],
  DISTANCE: ["distance"],
  TIME: ["timeSec"],
};

export function fieldsForType(type: string): SetField[] {
  return FIELDS_BY_TYPE[(type as ExerciseType) ?? "WEIGHT_REPS"] ?? ["weight", "reps"];
}

export const GRAPH_METRICS = [
  "EST_1RM",
  "MAX_WEIGHT",
  "VOLUME",
  "TOTAL_REPS",
  "MAX_REPS",
  "WEIGHT_FOR_REPS",
  "REP_MAXES",
  "MAX_DISTANCE",
  "MAX_TIME",
  "MAX_SPEED",
  "MAX_PACE",
] as const;
export type GraphMetric = (typeof GRAPH_METRICS)[number];

export const GOAL_TYPES = ["ONE_RM", "MAX_WEIGHT", "MAX_REPS", "MAX_DISTANCE", "MAX_TIME", "VOLUME"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const MEASUREMENT_GOAL_TYPES = ["INCREASE", "DECREASE", "SPECIFIC", "NONE"] as const;
export type MeasurementGoalType = (typeof MEASUREMENT_GOAL_TYPES)[number];

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const THEMES = ["light", "dark", "system"] as const;

/** Seed category colours (also used as the default palette in category editors). */
export const CATEGORY_PALETTE = [
  "#f97316", // orange
  "#10b981", // emerald
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#f59e0b", // amber
  "#ef4444", // red
  "#64748b", // slate
  "#eab308", // yellow
];

export const GROUP_PALETTE = CATEGORY_PALETTE;

/** Default seed categories (order matters). */
export const SEED_CATEGORIES: Array<{ name: string; colour: string }> = [
  { name: "Abs", colour: "#f59e0b" },
  { name: "Back", colour: "#10b981" },
  { name: "Biceps", colour: "#84cc16" },
  { name: "Cardio", colour: "#ef4444" },
  { name: "Chest", colour: "#f97316" },
  { name: "Legs", colour: "#a855f7" },
  { name: "Shoulders", colour: "#14b8a6" },
  { name: "Triceps", colour: "#ec4899" },
];

export const SESSION_COOKIE = "sf_session";
