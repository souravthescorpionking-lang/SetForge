// Seed data: system reference data + per-user defaults (run at signup).
// All deterministic — no randomness, so re-seeding is idempotent by unique keys.
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import { SEED_CATEGORIES } from "@/lib/constants";

type SeedExercise = { name: string; category: string; type?: string };

const SEED_EXERCISES: SeedExercise[] = [
  // ----- Chest -----
  { name: "Barbell Bench Press", category: "Chest" },
  { name: "Incline Barbell Bench Press", category: "Chest" },
  { name: "Decline Barbell Bench Press", category: "Chest" },
  { name: "Dumbbell Bench Press", category: "Chest" },
  { name: "Incline Dumbbell Press", category: "Chest" },
  { name: "Decline Dumbbell Press", category: "Chest" },
  { name: "Dumbbell Fly", category: "Chest" },
  { name: "Incline Dumbbell Fly", category: "Chest" },
  { name: "Cable Crossover", category: "Chest" },
  { name: "Machine Chest Press", category: "Chest" },
  { name: "Pec Deck Fly", category: "Chest" },
  { name: "Chest Dip", category: "Chest" },
  { name: "Push-Up", category: "Chest" },
  { name: "Smith Machine Bench Press", category: "Chest" },
  // ----- Back -----
  { name: "Deadlift", category: "Back" },
  { name: "Barbell Row", category: "Back" },
  { name: "Dumbbell Row", category: "Back" },
  { name: "T-Bar Row", category: "Back" },
  { name: "Pendlay Row", category: "Back" },
  { name: "Lat Pulldown", category: "Back" },
  { name: "Wide-Grip Lat Pulldown", category: "Back" },
  { name: "Pull-Up", category: "Back" },
  { name: "Chin-Up", category: "Back" },
  { name: "Seated Cable Row", category: "Back" },
  { name: "Straight-Arm Pulldown", category: "Back" },
  { name: "Barbell Shrug", category: "Back" },
  { name: "Dumbbell Shrug", category: "Back" },
  { name: "Rack Pull", category: "Back" },
  { name: "Good Morning", category: "Back" },
  // ----- Legs -----
  { name: "Barbell Squat", category: "Legs" },
  { name: "Front Squat", category: "Legs" },
  { name: "Hack Squat", category: "Legs" },
  { name: "Leg Press", category: "Legs" },
  { name: "Romanian Deadlift", category: "Legs" },
  { name: "Stiff-Leg Deadlift", category: "Legs" },
  { name: "Bulgarian Split Squat", category: "Legs" },
  { name: "Walking Lunge", category: "Legs" },
  { name: "Goblet Squat", category: "Legs" },
  { name: "Leg Extension", category: "Legs" },
  { name: "Lying Leg Curl", category: "Legs" },
  { name: "Seated Leg Curl", category: "Legs" },
  { name: "Standing Calf Raise", category: "Legs" },
  { name: "Seated Calf Raise", category: "Legs" },
  { name: "Hip Thrust", category: "Legs" },
  { name: "Step-Up", category: "Legs" },
  // ----- Shoulders -----
  { name: "Overhead Press", category: "Shoulders" },
  { name: "Dumbbell Shoulder Press", category: "Shoulders" },
  { name: "Arnold Press", category: "Shoulders" },
  { name: "Lateral Raise", category: "Shoulders" },
  { name: "Cable Lateral Raise", category: "Shoulders" },
  { name: "Front Raise", category: "Shoulders" },
  { name: "Rear Delt Fly", category: "Shoulders" },
  { name: "Face Pull", category: "Shoulders" },
  { name: "Upright Row", category: "Shoulders" },
  { name: "Machine Shoulder Press", category: "Shoulders" },
  // ----- Biceps -----
  { name: "Barbell Curl", category: "Biceps" },
  { name: "EZ-Bar Curl", category: "Biceps" },
  { name: "Dumbbell Curl", category: "Biceps" },
  { name: "Hammer Curl", category: "Biceps" },
  { name: "Incline Dumbbell Curl", category: "Biceps" },
  { name: "Preacher Curl", category: "Biceps" },
  { name: "Concentration Curl", category: "Biceps" },
  { name: "Cable Curl", category: "Biceps" },
  { name: "Spider Curl", category: "Biceps" },
  // ----- Triceps -----
  { name: "Close-Grip Bench Press", category: "Triceps" },
  { name: "Triceps Dip", category: "Triceps" },
  { name: "Skull Crusher", category: "Triceps" },
  { name: "Cable Pushdown", category: "Triceps" },
  { name: "Rope Pushdown", category: "Triceps" },
  { name: "Overhead Cable Extension", category: "Triceps" },
  { name: "Dumbbell Overhead Extension", category: "Triceps" },
  { name: "Bench Dip", category: "Triceps" },
  { name: "Single-Arm Pushdown", category: "Triceps" },
  // ----- Abs -----
  { name: "Plank", category: "Abs", type: "TIME" },
  { name: "Crunch", category: "Abs" },
  { name: "Sit-Up", category: "Abs" },
  { name: "Hanging Leg Raise", category: "Abs" },
  { name: "Hanging Knee Raise", category: "Abs" },
  { name: "Cable Crunch", category: "Abs" },
  { name: "Ab Wheel Rollout", category: "Abs" },
  { name: "Russian Twist", category: "Abs" },
  { name: "Bicycle Crunch", category: "Abs" },
  { name: "Decline Crunch", category: "Abs" },
  { name: "Side Plank", category: "Abs", type: "TIME" },
  { name: "Dragon Flag", category: "Abs" },
  // ----- Cardio (distance + time) -----
  { name: "Running", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Treadmill Run", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Treadmill Walk", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Outdoor Cycling", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Stationary Bike", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Elliptical", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Rowing Machine", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Swimming", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Jump Rope", category: "Cardio", type: "TIME" },
  { name: "Stair Climber", category: "Cardio", type: "TIME" },
  { name: "Sprint Intervals", category: "Cardio", type: "DISTANCE_TIME" },
  { name: "Mountain Hiking", category: "Cardio", type: "DISTANCE_TIME" },
];

const METRIC_PLATES: Array<[number, string, number]> = [
  [50, "#16a34a", 0],
  [25, "#ef4444", 4],
  [20, "#3b82f6", 4],
  [15, "#eab308", 4],
  [10, "#22c55e", 4],
  [5, "#e5e7eb", 4],
  [2.5, "#dc2626", 2],
  [1.25, "#9ca3af", 2],
  [1, "#a855f7", 2],
  [0.5, "#64748b", 2],
  [0.25, "#94a3b8", 2],
];

const IMPERIAL_PLATES: Array<[number, string, number]> = [
  [100, "#16a34a", 0],
  [55, "#dc2626", 2],
  [45, "#3b82f6", 4],
  [35, "#eab308", 2],
  [25, "#dc2626", 4],
  [10, "#22c55e", 4],
  [5, "#e5e7eb", 4],
  [2.5, "#dc2626", 2],
  [1.25, "#9ca3af", 2],
  [1, "#a855f7", 2],
  [0.5, "#64748b", 2],
  [0.25, "#94a3b8", 2],
];

export const SEED_MEASUREMENTS: Array<{
  name: string;
  unit: string;
  goalType: string;
  isEnabled: boolean;
  isDefault: boolean;
}> = [
  { name: "Body Weight", unit: "kg", goalType: "NONE", isEnabled: true, isDefault: true },
  { name: "Body Fat", unit: "%", goalType: "DECREASE", isEnabled: true, isDefault: false },
  { name: "Neck", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Shoulders", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Chest", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Left Bicep", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Right Bicep", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Left Forearm", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Right Forearm", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Waist", unit: "cm", goalType: "DECREASE", isEnabled: false, isDefault: false },
  { name: "Hips", unit: "cm", goalType: "NONE", isEnabled: false, isDefault: false },
  { name: "Left Thigh", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Right Thigh", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Left Calf", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
  { name: "Right Calf", unit: "cm", goalType: "INCREASE", isEnabled: false, isDefault: false },
];

const SYSTEM_UNITS = ["kg", "lbs", "cm", "in", "%", "bpm", "steps"];

/** Seed system-level reference data (idempotent). Returns unit name→id map. */
export async function seedSystemData(): Promise<Map<string, string>> {
  return ensureSystemUnits();
}

async function ensureSystemUnits(): Promise<Map<string, string>> {
  const existing = await db.measurementUnit.findMany({ where: { userId: null } });
  const have = new Map(existing.map((u) => [u.name, u.id]));
  for (const name of SYSTEM_UNITS) {
    if (!have.has(name)) {
      const created = await db.measurementUnit.create({
        data: { id: uuid7(), userId: null, name },
      });
      have.set(name, created.id);
    }
  }
  return have;
}

/** Per-user defaults, created inside the signup transaction. */
export async function buildPerUserSeed(userId: string) {
  const categories = SEED_CATEGORIES.map((c, i) => ({
    id: uuid7(),
    userId,
    name: c.name,
    colour: c.colour,
    sortOrder: i,
  }));

  const byName = new Map(categories.map((c) => [c.name, c.id]));
  const exercises = SEED_EXERCISES.map((e) => ({
    id: uuid7(),
    userId,
    categoryId: byName.get(e.category)!,
    name: e.name,
    type: e.type ?? "WEIGHT_REPS",
  }));

  const settings = {
    id: uuid7(),
    userId,
    theme: "system",
    unitSystem: "metric",
    weekStart: 1,
    defaultWeightIncrement: 2.5,
    homeSetsShown: 3,
    showCategory: true,
    trackPR: true,
    markSetsComplete: false,
    autoSelectNextSet: true,
    keepScreenOn: false,
    estOneRmRepLimit: 10,
    weeklyWorkoutTarget: 0,
    showSetType: true,
    showRpe: true,
    showTempo: true,
    showRest: true,
    autoRestFromRow: true,
    restEndBehaviour: "NOTIFY_AND_FOCUS_NEXT",
    e1rmMethod: "BRZYCKI",
  };

  const plates = [
    ...METRIC_PLATES.map(([weight, colour, count], i) => ({
      id: uuid7(),
      userId,
      weight,
      colour,
      count,
      isAvailable: count > 0,
      unitSystem: "metric",
      sortOrder: i,
    })),
    ...IMPERIAL_PLATES.map(([weight, colour, count], i) => ({
      id: uuid7(),
      userId,
      weight,
      colour,
      count,
      isAvailable: count > 0,
      unitSystem: "imperial",
      sortOrder: i,
    })),
  ];

  // measurement units are shared (system rows have userId null); resolve ids at runtime
  const unitByName = await ensureSystemUnits();
  const fallbackUnit = unitByName.get("kg")!;
  const measurements = SEED_MEASUREMENTS.map((m, i) => ({
    id: uuid7(),
    userId,
    unitId: unitByName.get(m.unit) ?? fallbackUnit!,
    name: m.name,
    goalType: m.goalType,
    isEnabled: m.isEnabled,
    isDefault: m.isDefault,
    sortOrder: i,
  }));

  return { categories, exercises, settings, plates, measurements };
}
