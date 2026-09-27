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

// ---------- Part 5: seeded program/session templates ----------
//
// Templates reference exercises by name (resolved against the user's seeded
// catalogue). Set templates: 3× blank (copy-previous) + a warm-up row on main
// compounds (reps pre-filled, weight left blank).

type TemplateSet = {
  weight?: number | null;
  reps?: number | null;
  distance?: number | null;
  timeSec?: number | null;
  setType?: string | null;
  rpe?: number | null;
  tempo?: string | null;
  restPlannedSec?: number | null;
};
type TemplateExercise = { name: string; sets: TemplateSet[] };
type TemplateDay = { name: string; dayType: string; exercises: TemplateExercise[] };
type TemplateProgram = {
  name: string;
  notes: string | null;
  kind: string;
  days: TemplateDay[];
  // ---- Part 6 §3: program metadata (auth-service writes these at signup) ----
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  daysPerWeek?: number;
  estMinutes?: number; // longest workout day, minutes
  highlights?: string[]; // ≤4 short bullet lines
};

const blank3: TemplateSet[] = [{}, {}, {}];
const warmup: TemplateSet = { reps: 10, setType: "WARMUP", restPlannedSec: 60 };
const compound = (): TemplateSet[] => [warmup, {}, {}, {}];

const PROGRAM_TEMPLATES: TemplateProgram[] = [
  {
    name: "Push / Pull / Legs",
    notes: "Classic 6-day split with rotating rest days.",
    kind: "ROUTINE",
    difficulty: "INTERMEDIATE",
    daysPerWeek: 6,
    estMinutes: 60,
    highlights: [
      "Six sessions over a 7-day cycle",
      "Heavy compounds first, isolation to finish",
      "Warm-up row pre-filled on main lifts",
      "Rest day after every third session",
    ],
    days: [
      {
        name: "Push",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Overhead Press", sets: compound() },
          { name: "Incline Dumbbell Press", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Cable Pushdown", sets: blank3 },
        ],
      },
      {
        name: "Pull",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Row", sets: compound() },
          { name: "Lat Pulldown", sets: blank3 },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Face Pull", sets: blank3 },
          { name: "Barbell Curl", sets: blank3 },
        ],
      },
      {
        name: "Legs",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Romanian Deadlift", sets: blank3 },
          { name: "Leg Press", sets: blank3 },
          { name: "Lying Leg Curl", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Push", dayType: "WORKOUT", exercises: [] },
      { name: "Pull", dayType: "WORKOUT", exercises: [] },
      { name: "Legs", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Upper / Lower",
    notes: "4 training days per week.",
    kind: "ROUTINE",
    difficulty: "BEGINNER",
    daysPerWeek: 4,
    estMinutes: 55,
    highlights: [
      "Four training days per week",
      "Balanced push and pull on upper days",
      "Warm-up row pre-filled on main lifts",
      "Double rest at the end of the week",
    ],
    days: [
      {
        name: "Upper",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Barbell Row", sets: compound() },
          { name: "Overhead Press", sets: blank3 },
          { name: "Lat Pulldown", sets: blank3 },
          { name: "Barbell Curl", sets: blank3 },
          { name: "Skull Crusher", sets: blank3 },
        ],
      },
      {
        name: "Lower",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Romanian Deadlift", sets: blank3 },
          { name: "Leg Press", sets: blank3 },
          { name: "Seated Leg Curl", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Upper", dayType: "WORKOUT", exercises: [] },
      { name: "Lower", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Full Body 3×",
    notes: "Three full-body sessions per week.",
    kind: "ROUTINE",
    difficulty: "BEGINNER",
    daysPerWeek: 3,
    estMinutes: 45,
    highlights: [
      "Three full-body sessions weekly",
      "Squat, bench and row in every cycle",
      "Rest day between every session",
      "Shortest commitment of the routines",
    ],
    days: [
      {
        name: "Full Body A",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Barbell Row", sets: blank3 },
          { name: "Lat Pulldown", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Full Body B", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Full Body C", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  // ---- Part 6 §3: six additional routine templates (2 per difficulty) ----
  {
    name: "Beginner Full Body A/B",
    notes: "Alternating full-body days with machine-first exercises.",
    kind: "ROUTINE",
    difficulty: "BEGINNER",
    daysPerWeek: 3,
    estMinutes: 45,
    highlights: [
      "Two alternating full-body days",
      "Machine-first exercise selection",
      "Coaching notes on every exercise",
      "Rest day between every session",
    ],
    days: [
      {
        name: "Full Body A",
        dayType: "WORKOUT",
        exercises: [
          { name: "Goblet Squat", sets: compound() },
          { name: "Machine Chest Press", sets: blank3 },
          { name: "Lat Pulldown", sets: blank3 },
          { name: "Machine Shoulder Press", sets: blank3 },
          { name: "Crunch", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      {
        name: "Full Body B",
        dayType: "WORKOUT",
        exercises: [
          { name: "Leg Press", sets: blank3 },
          { name: "Push-Up", sets: blank3 },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Plank", sets: [{ timeSec: 30 }, { timeSec: 30 }, { timeSec: 45 }] },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Full Body A", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Beginner Push / Pull",
    notes: "Four easy-to-learn sessions per week.",
    kind: "ROUTINE",
    difficulty: "BEGINNER",
    daysPerWeek: 4,
    estMinutes: 40,
    highlights: [
      "Four short sessions per week",
      "Push one day, pull the next",
      "Low-skill machine and cable focus",
      "Under 45 minutes per session",
    ],
    days: [
      {
        name: "Push",
        dayType: "WORKOUT",
        exercises: [
          { name: "Machine Chest Press", sets: compound() },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Rope Pushdown", sets: blank3 },
          { name: "Cable Lateral Raise", sets: blank3 },
        ],
      },
      {
        name: "Pull",
        dayType: "WORKOUT",
        exercises: [
          { name: "Lat Pulldown", sets: compound() },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Face Pull", sets: blank3 },
          { name: "Dumbbell Curl", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Push", dayType: "WORKOUT", exercises: [] },
      { name: "Pull", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Powerbuilding Upper / Lower",
    notes: "Heavy strength work on big lifts plus hypertrophy volume days.",
    kind: "ROUTINE",
    difficulty: "INTERMEDIATE",
    daysPerWeek: 4,
    estMinutes: 65,
    highlights: [
      "Strength days paired with volume days",
      "Two heavy compounds per strength day",
      "Four sessions across the week",
      "Barbell-first, isolation to finish",
    ],
    days: [
      {
        name: "Upper Power",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Barbell Row", sets: compound() },
          { name: "Overhead Press", sets: blank3 },
          { name: "Close-Grip Bench Press", sets: blank3 },
          { name: "EZ-Bar Curl", sets: blank3 },
        ],
      },
      {
        name: "Lower Power",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Deadlift", sets: compound() },
          { name: "Leg Press", sets: blank3 },
          { name: "Seated Leg Curl", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      {
        name: "Upper Volume",
        dayType: "WORKOUT",
        exercises: [
          { name: "Incline Dumbbell Press", sets: blank3 },
          { name: "Wide-Grip Lat Pulldown", sets: blank3 },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Skull Crusher", sets: blank3 },
          { name: "Hammer Curl", sets: blank3 },
        ],
      },
      {
        name: "Lower Volume",
        dayType: "WORKOUT",
        exercises: [
          { name: "Hack Squat", sets: blank3 },
          { name: "Bulgarian Split Squat", sets: blank3 },
          { name: "Seated Leg Curl", sets: blank3 },
          { name: "Leg Extension", sets: blank3 },
          { name: "Seated Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Torso / Limbs",
    notes: "Four-day split pairing dedicated torso and limb days.",
    kind: "ROUTINE",
    difficulty: "INTERMEDIATE",
    daysPerWeek: 4,
    estMinutes: 65,
    highlights: [
      "Upper body and lower body split days",
      "Six exercises per session",
      "Two sessions of each per week",
      "Warm-up row pre-filled on main lifts",
    ],
    days: [
      {
        name: "Torso",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Barbell Row", sets: compound() },
          { name: "Overhead Press", sets: blank3 },
          { name: "Wide-Grip Lat Pulldown", sets: blank3 },
          { name: "Skull Crusher", sets: blank3 },
          { name: "EZ-Bar Curl", sets: blank3 },
        ],
      },
      {
        name: "Limbs",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Romanian Deadlift", sets: blank3 },
          { name: "Leg Press", sets: blank3 },
          { name: "Lying Leg Curl", sets: blank3 },
          { name: "Hip Thrust", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Torso", dayType: "WORKOUT", exercises: [] },
      { name: "Limbs", dayType: "WORKOUT", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Advanced 6-Day PPL",
    notes: "Six sessions per week — heavy and volume PPL rotations.",
    kind: "ROUTINE",
    difficulty: "ADVANCED",
    daysPerWeek: 6,
    estMinutes: 75,
    highlights: [
      "Six-day cycle with one rest day",
      "Heavy and volume sessions alternate",
      "Deadlift and squat in the same week",
      "Highest weekly volume of the templates",
    ],
    days: [
      {
        name: "Push Heavy",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Overhead Press", sets: compound() },
          { name: "Incline Dumbbell Press", sets: blank3 },
          { name: "Cable Lateral Raise", sets: blank3 },
          { name: "Skull Crusher", sets: blank3 },
        ],
      },
      {
        name: "Pull Heavy",
        dayType: "WORKOUT",
        exercises: [
          { name: "Deadlift", sets: compound() },
          { name: "Wide-Grip Lat Pulldown", sets: blank3 },
          { name: "T-Bar Row", sets: blank3 },
          { name: "Face Pull", sets: blank3 },
          { name: "Preacher Curl", sets: blank3 },
        ],
      },
      {
        name: "Legs Heavy",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Romanian Deadlift", sets: compound() },
          { name: "Leg Press", sets: blank3 },
          { name: "Seated Leg Curl", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      {
        name: "Push Volume",
        dayType: "WORKOUT",
        exercises: [
          { name: "Incline Barbell Bench Press", sets: compound() },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Cable Crossover", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Overhead Cable Extension", sets: blank3 },
        ],
      },
      {
        name: "Pull Volume",
        dayType: "WORKOUT",
        exercises: [
          { name: "Pendlay Row", sets: compound() },
          { name: "Pull-Up", sets: blank3 },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Straight-Arm Pulldown", sets: blank3 },
          { name: "Rear Delt Fly", sets: blank3 },
          { name: "Dumbbell Curl", sets: blank3 },
        ],
      },
      {
        name: "Legs Volume",
        dayType: "WORKOUT",
        exercises: [
          { name: "Front Squat", sets: compound() },
          { name: "Bulgarian Split Squat", sets: blank3 },
          { name: "Stiff-Leg Deadlift", sets: blank3 },
          { name: "Leg Extension", sets: blank3 },
          { name: "Seated Calf Raise", sets: blank3 },
          { name: "Walking Lunge", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Advanced 5-Day Split",
    notes: "One muscle group per day, five sessions weekly.",
    kind: "ROUTINE",
    difficulty: "ADVANCED",
    daysPerWeek: 5,
    estMinutes: 60,
    highlights: [
      "One muscle group per day",
      "Five sessions plus two rest days",
      "Arms get a dedicated day",
      "Straight sets with full rest",
    ],
    days: [
      {
        name: "Chest",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Incline Dumbbell Press", sets: blank3 },
          { name: "Decline Barbell Bench Press", sets: blank3 },
          { name: "Cable Crossover", sets: blank3 },
          { name: "Chest Dip", sets: blank3 },
        ],
      },
      {
        name: "Back",
        dayType: "WORKOUT",
        exercises: [
          { name: "Deadlift", sets: compound() },
          { name: "Pull-Up", sets: blank3 },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Straight-Arm Pulldown", sets: blank3 },
          { name: "Barbell Shrug", sets: blank3 },
        ],
      },
      {
        name: "Legs",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Romanian Deadlift", sets: blank3 },
          { name: "Leg Press", sets: blank3 },
          { name: "Lying Leg Curl", sets: blank3 },
          { name: "Standing Calf Raise", sets: blank3 },
        ],
      },
      {
        name: "Shoulders",
        dayType: "WORKOUT",
        exercises: [
          { name: "Overhead Press", sets: compound() },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Rear Delt Fly", sets: blank3 },
          { name: "Face Pull", sets: blank3 },
        ],
      },
      {
        name: "Arms",
        dayType: "WORKOUT",
        exercises: [
          { name: "Close-Grip Bench Press", sets: compound() },
          { name: "Skull Crusher", sets: blank3 },
          { name: "Barbell Curl", sets: compound() },
          { name: "Preacher Curl", sets: blank3 },
          { name: "Hammer Curl", sets: blank3 },
          { name: "Rope Pushdown", sets: blank3 },
        ],
      },
      { name: "Rest", dayType: "REST", exercises: [] },
      { name: "Rest", dayType: "REST", exercises: [] },
    ],
  },
  {
    name: "Quick Push",
    notes: null,
    kind: "SESSION",
    estMinutes: 30,
    days: [
      {
        name: "Quick Push",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Bench Press", sets: compound() },
          { name: "Overhead Press", sets: blank3 },
          { name: "Cable Pushdown", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Quick Pull",
    notes: null,
    kind: "SESSION",
    estMinutes: 30,
    days: [
      {
        name: "Quick Pull",
        dayType: "WORKOUT",
        exercises: [
          { name: "Lat Pulldown", sets: blank3 },
          { name: "Seated Cable Row", sets: blank3 },
          { name: "Barbell Curl", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Quick Legs",
    notes: null,
    kind: "SESSION",
    estMinutes: 30,
    days: [
      {
        name: "Quick Legs",
        dayType: "WORKOUT",
        exercises: [
          { name: "Barbell Squat", sets: compound() },
          { name: "Leg Press", sets: blank3 },
          { name: "Lying Leg Curl", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Core 15",
    notes: "15-minute core circuit.",
    kind: "SESSION",
    estMinutes: 15,
    days: [
      {
        name: "Core 15",
        dayType: "WORKOUT",
        exercises: [
          { name: "Plank", sets: [{ timeSec: 45 }, { timeSec: 45 }, { timeSec: 60 }] },
          { name: "Crunch", sets: blank3 },
          { name: "Hanging Leg Raise", sets: blank3 },
          { name: "Russian Twist", sets: blank3 },
        ],
      },
    ],
  },
  // ---- Part 6 §3: six additional session templates (15–60 min) ----
  {
    name: "Cardio Quick Hit",
    notes: "15 minutes of machine cardio intervals.",
    kind: "SESSION",
    estMinutes: 15,
    days: [
      {
        name: "Cardio Quick Hit",
        dayType: "WORKOUT",
        exercises: [
          { name: "Stationary Bike", sets: [{ timeSec: 300, restPlannedSec: 60 }, { timeSec: 300 }, { timeSec: 300 }] },
          { name: "Jump Rope", sets: [{ timeSec: 60, restPlannedSec: 60 }, { timeSec: 60 }, { timeSec: 60 }] },
          { name: "Stair Climber", sets: [{ timeSec: 300, restPlannedSec: 60 }, { timeSec: 300 }, { timeSec: 300 }] },
        ],
      },
    ],
  },
  {
    name: "Hotel Bodyweight",
    notes: "No-equipment session for travel days.",
    kind: "SESSION",
    estMinutes: 20,
    days: [
      {
        name: "Hotel Bodyweight",
        dayType: "WORKOUT",
        exercises: [
          { name: "Push-Up", sets: compound() },
          { name: "Bench Dip", sets: blank3 },
          { name: "Crunch", sets: blank3 },
          { name: "Plank", sets: [{ timeSec: 45 }, { timeSec: 45 }, { timeSec: 60 }] },
        ],
      },
    ],
  },
  {
    name: "Express Full Body",
    notes: "Quick full-body session when time is short.",
    kind: "SESSION",
    estMinutes: 25,
    days: [
      {
        name: "Express Full Body",
        dayType: "WORKOUT",
        exercises: [
          { name: "Goblet Squat", sets: compound() },
          { name: "Machine Chest Press", sets: blank3 },
          { name: "Lat Pulldown", sets: blank3 },
          { name: "Plank", sets: [{ timeSec: 30 }, { timeSec: 30 }, { timeSec: 45 }] },
        ],
      },
    ],
  },
  {
    name: "Shoulder Focus",
    notes: "Delt-focused session with front, side and rear work.",
    kind: "SESSION",
    estMinutes: 30,
    days: [
      {
        name: "Shoulder Focus",
        dayType: "WORKOUT",
        exercises: [
          { name: "Overhead Press", sets: compound() },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Lateral Raise", sets: blank3 },
          { name: "Rear Delt Fly", sets: blank3 },
          { name: "Face Pull", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Dumbbell Only Upper",
    notes: "Full upper body with a single pair of dumbbells.",
    kind: "SESSION",
    estMinutes: 35,
    days: [
      {
        name: "Dumbbell Only Upper",
        dayType: "WORKOUT",
        exercises: [
          { name: "Dumbbell Bench Press", sets: compound() },
          { name: "Dumbbell Row", sets: blank3 },
          { name: "Dumbbell Shoulder Press", sets: blank3 },
          { name: "Hammer Curl", sets: blank3 },
          { name: "Dumbbell Overhead Extension", sets: blank3 },
        ],
      },
    ],
  },
  {
    name: "Arm Blaster",
    notes: "Biceps and triceps session with straight sets.",
    kind: "SESSION",
    estMinutes: 40,
    days: [
      {
        name: "Arm Blaster",
        dayType: "WORKOUT",
        exercises: [
          { name: "Close-Grip Bench Press", sets: compound() },
          { name: "Skull Crusher", sets: blank3 },
          { name: "Barbell Curl", sets: compound() },
          { name: "Incline Dumbbell Curl", sets: blank3 },
          { name: "Hammer Curl", sets: blank3 },
          { name: "Rope Pushdown", sets: blank3 },
        ],
      },
    ],
  },
];

/** Per-user defaults, created inside the signup transaction. */
export async function buildPerUserSeed(userId: string, timezone?: string) {
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
    timezone: timezone || "UTC",
    autoAdvanceRest: true,
    scheduleMovesCursor: true,
    advanceTrigger: "FINISH_OR_MIDNIGHT",
    showProjectedDays: false,
    reminderTime: null,
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

  // program/session templates — exercise ids resolved from the seeded catalogue
  const exerciseIdByName = new Map(exercises.map((e) => [e.name, e.id]));
  const programs = PROGRAM_TEMPLATES.map((t, pi) => ({
    id: uuid7(),
    name: t.name,
    notes: t.notes,
    kind: t.kind,
    sortOrder: pi,
    // Part 6 §3 metadata (written by the signup transaction in auth-service)
    difficulty: t.difficulty ?? null,
    daysPerWeek: t.daysPerWeek ?? null,
    estMinutes: t.estMinutes ?? null,
    highlights: t.highlights ?? null,
    days: t.days.map((d, di) => ({
      id: uuid7(),
      name: d.name,
      dayType: d.dayType,
      sortOrder: di,
      exercises: d.exercises
        .filter((e) => exerciseIdByName.has(e.name))
        .map((e, ei) => ({
          id: uuid7(),
          exerciseId: exerciseIdByName.get(e.name)!,
          sortOrder: ei,
          sets: e.sets.map((ps) => ({
            id: uuid7(),
            weight: ps.weight ?? null,
            reps: ps.reps ?? null,
            distance: ps.distance ?? null,
            timeSec: ps.timeSec ?? null,
            setType: ps.setType ?? null,
            rpe: ps.rpe ?? null,
            tempo: ps.tempo ?? null,
            restPlannedSec: ps.restPlannedSec ?? null,
          })),
        })),
    })),
  }));

  return { categories, exercises, settings, plates, measurements, programs };
}
