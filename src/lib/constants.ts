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
  "AVG_REST",
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

// ---------- Part 2: set types / RPE / tempo / rest ----------

export const SET_TYPES = ["NORMAL", "WARMUP", "DROP", "FAILURE", "AMRAP"] as const;
export type SetType = (typeof SET_TYPES)[number];

/** Display meta for the single-letter set-type tag. */
export const SET_TYPE_META: Record<SetType, { letter: string; label: string; description: string; className: string }> = {
  NORMAL: { letter: "N", label: "Normal", description: "Standard working set", className: "bg-muted text-muted-foreground" },
  WARMUP: { letter: "W", label: "Warm-up", description: "Excluded from PRs, e1RM & volume", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  DROP: { letter: "D", label: "Drop", description: "Post-failure weight drop; linked to previous set", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  FAILURE: { letter: "F", label: "Failure", description: "Taken to failure; excluded from e1RM", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  AMRAP: { letter: "A", label: "AMRAP", description: "As many reps as possible — shown as n+", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

/** RPE scale options (6.0–10.0, step 0.5). */
export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

/** Tempo pattern: ecc-pause-con-pause (4th segment optional), 0–99 sec each.
 *  Part 10 §4.6: the CONCENTRIC (3rd) segment may be "x" (explosive). */
export const TEMPO_REGEX = /^\d{1,2}-\d{1,2}-(?:\d{1,2}|x)(?:-\d{1,2})?$/;

export const REST_END_BEHAVIOURS = ["NOTIFY", "NOTIFY_AND_FOCUS_NEXT"] as const;
export type RestEndBehaviour = (typeof REST_END_BEHAVIOURS)[number];

export const E1RM_METHODS = ["BRZYCKI", "RPE", "EPLEY"] as const;
export type E1rmMethod = (typeof E1RM_METHODS)[number];

/** Parse a tempo string into segments; returns null when invalid.
 *  NOTE: segments containing "x" parse to NaN → use tempoTotalSec for
 *  arithmetic (x counts as 1s, explosive) or split manually for display. */
export function parseTempo(tempo: string): number[] | null {
  if (!TEMPO_REGEX.test(tempo)) return null;
  const parts = tempo.split("-").map(Number);
  return parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 99) ? parts : null;
}

/** Normalise a tempo string to canonical form (e.g. "3-1-1" → "3-1-1-0").
 *  Keeps an "x" concentric segment verbatim (§4.6). */
export function normaliseTempo(tempo: string): string | null {
  if (!TEMPO_REGEX.test(tempo)) return null;
  const parts = tempo.split("-");
  return parts.length === 3 ? `${parts.join("-")}-0` : parts.join("-");
}

/** Total seconds of a tempo string for duration estimates ("x" = 1s). */
export function tempoTotalSec(tempo: string): number | null {
  if (!TEMPO_REGEX.test(tempo)) return null;
  return tempo.split("-").reduce((sum, p) => sum + (p === "x" ? 1 : Number(p)), 0);
}

/** Format seconds as m:ss (or h:mm:ss beyond an hour) — table cell style. */
export function formatRestSec(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "–";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- Part 6: muscles / equipment / program metadata ----------

export const MUSCLES = [
  "CHEST", "BACK", "LATS", "TRAPS", "SHOULDERS", "BICEPS", "TRICEPS", "FOREARMS",
  "ABS", "OBLIQUES", "LOWER_BACK", "GLUTES", "QUADS", "HAMSTRINGS", "CALVES",
  "ADDUCTORS", "ABDUCTORS", "NECK", "FULL_BODY", "CARDIO",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  CHEST: "Chest", BACK: "Back", LATS: "Lats", TRAPS: "Traps", SHOULDERS: "Shoulders",
  BICEPS: "Biceps", TRICEPS: "Triceps", FOREARMS: "Forearms", ABS: "Abs", OBLIQUES: "Obliques",
  LOWER_BACK: "Lower back", GLUTES: "Glutes", QUADS: "Quads", HAMSTRINGS: "Hamstrings",
  CALVES: "Calves", ADDUCTORS: "Adductors", ABDUCTORS: "Abductors", NECK: "Neck",
  FULL_BODY: "Full body", CARDIO: "Cardio",
};

export const EQUIPMENT = [
  "BARBELL", "DUMBBELL", "KETTLEBELL", "CABLE", "MACHINE", "SMITH", "BODYWEIGHT", "BAND",
  "EZ_BAR", "TRAP_BAR", "BENCH", "PULLUP_BAR", "DIP_BAR", "PLATE", "MEDICINE_BALL",
  "BOX", "SLED", "ROWER", "BIKE", "TREADMILL", "OTHER",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  BARBELL: "Barbell", DUMBBELL: "Dumbbell", KETTLEBELL: "Kettlebell", CABLE: "Cable",
  MACHINE: "Machine", SMITH: "Smith", BODYWEIGHT: "Bodyweight", BAND: "Band",
  EZ_BAR: "EZ bar", TRAP_BAR: "Trap bar", BENCH: "Bench", PULLUP_BAR: "Pull-up bar",
  DIP_BAR: "Dip bar", PLATE: "Plate", MEDICINE_BALL: "Medicine ball", BOX: "Box",
  SLED: "Sled", ROWER: "Rower", BIKE: "Bike", TREADMILL: "Treadmill", OTHER: "Other",
};

/**
 * Muscle dot colours — one accent-derived palette of 8 hues, mapped
 * deterministically by enum index (index % 8). Dots/chips only, never full-bleed.
 */
export const MUSCLE_COLOUR_PALETTE = [
  "#f97316", "#10b981", "#a855f7", "#14b8a6", "#ec4899", "#f59e0b", "#84cc16", "#ef4444",
] as const;

export function muscleColour(muscle: string): string {
  const idx = MUSCLES.indexOf(muscle as Muscle);
  return MUSCLE_COLOUR_PALETTE[(idx < 0 ? 0 : idx) % MUSCLE_COLOUR_PALETTE.length];
}

export const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced",
};

export const PROFILE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const PROFILE_GOALS = ["STRENGTH", "MUSCLE", "FAT_LOSS", "GENERAL"] as const;
export const PROFILE_GOAL_LABELS: Record<(typeof PROFILE_GOALS)[number], string> = {
  STRENGTH: "Strength", MUSCLE: "Muscle", FAT_LOSS: "Fat loss", GENERAL: "General",
};

export const PHOTO_SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
export const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  FRONT: "Front", BACK: "Back", LEFT: "Left", RIGHT: "Right",
};

export const REST_DISPLAYS = ["BAR", "RING"] as const;
export const FINISH_BEHAVIOURS = ["ALWAYS_SAVE", "ASK"] as const;
export const CALENDAR_STYLES = ["GRID", "SCROLL"] as const;

export const DEFAULT_TEMPO_PRESETS = ["2-0-2-0", "3-1-1-0", "4-0-1-0", "1-0-1-0"] as const;

// ---------- Part 10 §4: Workout Builder ----------

/** §4.6 static tempo presets (radio rows of the tempo picker; "None" is a
 *  separate choice, not a preset). The 3rd segment "x" = explosive. */
export const TEMPO_PRESETS = [
  "3-0-1-0",
  "3-1-1-0",
  "2-0-x-0",
  "3-0-1-1",
  "3-0-x-0",
  "2-0-2-0",
  "4-0-x-0",
  "4-0-1-0",
] as const;

/** §4.4 muscle filter rows — the 16 spec entries, each expanding to the
 *  primaryMuscles enum values it covers (the on-demand "Core" precedent:
 *  one UI row may match several stored muscle values). */
export const BUILDER_MUSCLE_FILTERS = [
  { key: "ABS", label: "Abs/Core", muscles: ["ABS", "OBLIQUES"] },
  { key: "BACK", label: "Back", muscles: ["BACK", "LATS"] },
  { key: "BICEPS", label: "Biceps", muscles: ["BICEPS"] },
  { key: "CALVES", label: "Calves", muscles: ["CALVES"] },
  { key: "CHEST", label: "Chest", muscles: ["CHEST"] },
  { key: "FOREARMS", label: "Forearms", muscles: ["FOREARMS"] },
  { key: "FULL_BODY", label: "Full body", muscles: ["FULL_BODY"] },
  { key: "GLUTES", label: "Glutes", muscles: ["GLUTES"] },
  { key: "HAMSTRINGS", label: "Hamstrings", muscles: ["HAMSTRINGS"] },
  { key: "HIPS", label: "Hips", muscles: ["ADDUCTORS", "ABDUCTORS"] },
  { key: "LOWER_BACK", label: "Lower back", muscles: ["LOWER_BACK"] },
  { key: "QUADS", label: "Quads", muscles: ["QUADS"] },
  { key: "REAR_DELTS", label: "Rear delts", muscles: ["SHOULDERS"] },
  { key: "SHOULDERS", label: "Shoulders", muscles: ["SHOULDERS"] },
  { key: "TRAPS", label: "Traps", muscles: ["TRAPS"] },
  { key: "TRICEPS", label: "Triceps", muscles: ["TRICEPS"] },
] as const;

export type BuilderMuscleFilter = (typeof BUILDER_MUSCLE_FILTERS)[number]["key"];

/** Expand §4.4 muscle filter keys into primaryMuscles enum values (deduped). */
export function builderMuscleKeysToEnum(keys: string[]): string[] {
  const out = new Set<string>();
  for (const row of BUILDER_MUSCLE_FILTERS) {
    if (keys.includes(row.key)) for (const m of row.muscles) out.add(m);
  }
  return [...out];
}

/**
 * §4.4 canonical equipment filter rows — the spec's seeded list. `id` is the
 * stable URL/filter key; `matches` are the stored Exercise.equipment enum
 * values the row covers (seeded rows without a 1:1 enum value alias to the
 * closest machine/cable/band key — the catalog's granularity). The API unions
 * these with the distinct values actually found in the user's catalog.
 */
export const CANONICAL_EQUIPMENT = [
  { id: "BODYWEIGHT", label: "Bodyweight", matches: ["BODYWEIGHT"] },
  { id: "BARBELL", label: "Barbell", matches: ["BARBELL"] },
  { id: "DUMBBELL", label: "Dumbbells", matches: ["DUMBBELL"] },
  { id: "KETTLEBELL", label: "Kettlebell", matches: ["KETTLEBELL"] },
  { id: "BENCH", label: "Bench", matches: ["BENCH"] },
  { id: "INCLINE_BENCH", label: "Incline bench", matches: ["BENCH"] },
  { id: "CABLE", label: "Cable (4-stack)", matches: ["CABLE"] },
  { id: "SMITH", label: "Smith machine", matches: ["SMITH"] },
  { id: "LEG_PRESS", label: "Leg press", matches: ["MACHINE"] },
  { id: "HACK_SQUAT", label: "Hack squat", matches: ["MACHINE"] },
  { id: "LEG_CURL", label: "Leg curl machine", matches: ["MACHINE"] },
  { id: "LEG_EXTENSION", label: "Leg extension machine", matches: ["MACHINE"] },
  { id: "HIP_THRUST", label: "Hip thrust machine", matches: ["MACHINE"] },
  { id: "CHEST_SUPPORTED_ROW", label: "Chest supported row", matches: ["MACHINE"] },
  { id: "LAT_PULLDOWN", label: "Lat pulldown", matches: ["CABLE", "MACHINE"] },
  { id: "PULLUP_BAR", label: "Pull-up bar", matches: ["PULLUP_BAR"] },
  { id: "DIP_BAR", label: "Dip station", matches: ["DIP_BAR"] },
  { id: "GHD", label: "GHD", matches: ["MACHINE"] },
  { id: "PLATE_LOADED", label: "Plate-loaded machine", matches: ["MACHINE"] },
  { id: "BAND", label: "Resistance band", matches: ["BAND"] },
  { id: "LONG_BAND", label: "Long band", matches: ["BAND"] },
  { id: "MEDICINE_BALL", label: "Med ball", matches: ["MEDICINE_BALL"] },
  { id: "AB_WHEEL", label: "Ab wheel", matches: ["OTHER"] },
  { id: "WEDGE_PLATE", label: "Wedge/plate", matches: ["PLATE"] },
  { id: "TRAP_BAR", label: "Trap bar", matches: ["TRAP_BAR"] },
  { id: "EZ_BAR", label: "EZ bar", matches: ["EZ_BAR"] },
  { id: "LANDMINE", label: "Landmine", matches: ["OTHER"] },
  { id: "SLED", label: "Sled", matches: ["SLED"] },
  { id: "ROPE_ATTACHMENT", label: "Rope attachment", matches: ["CABLE"] },
] as const;

export type CanonicalEquipmentId = (typeof CANONICAL_EQUIPMENT)[number]["id"];

/** Resolve canonical equipment filter ids → the stored enum values they match. */
export function canonicalEquipmentToEnum(ids: string[]): string[] {
  const out = new Set<string>();
  for (const row of CANONICAL_EQUIPMENT) {
    if (ids.includes(row.id)) for (const m of row.matches) out.add(m);
  }
  // Raw enum ids also pass through (values found in data but not in the seed).
  for (const id of ids) if ((EQUIPMENT as readonly string[]).includes(id)) out.add(id);
  return [...out];
}

/** Set-level time constants for the duration estimate formula (§1 RoutineDay.estMinutes). */
export const EST_MINUTES_PER_SET_SEC = 30; // avg set duration
export const EST_MINUTES_DEFAULT_REST_SEC = 90; // fallback rest when unset
export const DAY_MINUTES_CAP = 90; // DurationRing fraction cap (fraction = est / cap)

/** Missed-derivation grace (§4.13): PLANNED → MISSED when now > date + timeOfDay + 4h. */
export const MISSED_GRACE_HOURS = 4;
