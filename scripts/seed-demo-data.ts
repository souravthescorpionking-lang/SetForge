/**
 * Demo data seeder — populates the demo account with ~13 weeks of realistic
 * training history through the PUBLIC API (validates the full stack incl.
 * PR recompute). Run: bun scripts/seed-demo-data.ts
 *
 * Creates:
 *  - ~34 workouts (Push / Pull / Legs rotation + cardio Saturdays) with
 *    linearly progressing weights, deload weeks, occasional comments
 *  - Weekly body-weight + body-fat measurement records
 *  - Three strength goals
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL ?? "demo@setforge.app";
const PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

let cookie = "";

async function api<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, 3000 * attempt)); // server may be restarting
        continue;
      }
    }
  }
  throw lastErr;
}

// ---------- deterministic-ish noise ----------
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const noise = (amp: number) => (rand() - 0.5) * 2 * amp;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2d = (n: number) => Math.round(n / 2.5) * 2.5; // nearest 2.5kg

// ---------- date helpers (UTC day keys) ----------
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

// ---------- workout templates ----------
type TemplateExercise = {
  name: string;
  startWeight: number;
  weeklyGain: number; // kg per week
  sets: number;
  repPattern: number[];
  accessory?: boolean; // lighter jumps, nearest 1.25 rounding
};

type Template = { name: string; kind: string; exercises: TemplateExercise[] };

const PUSH: Template = {
  name: "Push",
  kind: "Chest day",
  exercises: [
    { name: "Barbell Bench Press", startWeight: 72.5, weeklyGain: 0.9, sets: 4, repPattern: [8, 8, 7, 6] },
    { name: "Dumbbell Bench Press", startWeight: 26, weeklyGain: 0.45, sets: 3, repPattern: [10, 10, 8], accessory: true },
    { name: "Arnold Press", startWeight: 18, weeklyGain: 0.3, sets: 3, repPattern: [12, 10, 10], accessory: true },
    { name: "Cable Pushdown", startWeight: 25, weeklyGain: 0.35, sets: 3, repPattern: [12, 12, 10], accessory: true },
  ],
};

const PULL: Template = {
  name: "Pull",
  kind: "Back day",
  exercises: [
    { name: "Deadlift", startWeight: 110, weeklyGain: 1.4, sets: 4, repPattern: [6, 6, 5, 5] },
    { name: "Barbell Row", startWeight: 60, weeklyGain: 0.7, sets: 4, repPattern: [8, 8, 8, 6] },
    { name: "Lat Pulldown", startWeight: 55, weeklyGain: 0.5, sets: 3, repPattern: [10, 10, 9], accessory: true },
    { name: "Barbell Curl", startWeight: 30, weeklyGain: 0.3, sets: 3, repPattern: [12, 10, 8], accessory: true },
  ],
};

const LEGS: Template = {
  name: "Legs",
  kind: "Leg day",
  exercises: [
    { name: "Barbell Squat", startWeight: 95, weeklyGain: 1.1, sets: 4, repPattern: [8, 8, 7, 6] },
    { name: "Leg Press", startWeight: 180, weeklyGain: 2.2, sets: 3, repPattern: [10, 10, 8] },
    { name: "Lying Leg Curl", startWeight: 35, weeklyGain: 0.4, sets: 3, repPattern: [12, 12, 10], accessory: true },
    { name: "Seated Calf Raise", startWeight: 45, weeklyGain: 0.35, sets: 3, repPattern: [15, 15, 12], accessory: true },
  ],
};

const CARDIO: Template = {
  name: "Cardio",
  kind: "Conditioning",
  exercises: [
    { name: "Treadmill Run", startWeight: 0, weeklyGain: 0, sets: 1, repPattern: [1] }, // distance/time handled below
    { name: "Hanging Knee Raise", startWeight: 0, weeklyGain: 0, sets: 3, repPattern: [12, 12, 10] }, // bodyweight reps
  ],
};

const COMMENTS = [
  "Felt strong today 💪",
  "Grip gave out on the last set",
  "New gym PR attempt — went well",
  "Slightly fatigued, kept intensity moderate",
  "Great session, bar speed excellent",
  "Deload week, felt fresh",
  "Trained with a spotter, pushed hard",
  "Low sleep but still hit the numbers",
];

// ---------- main ----------
async function main() {
  console.log("→ login");
  await api("/api/auth/login", "POST", { email: EMAIL, password: PASSWORD });

  console.log("→ fetch exercises + measurements");
  const exercises = await api<Array<{ id: string; name: string; type: string }>>("/api/exercises", "GET");
  const byName = new Map(exercises.map((e) => [e.name, e]));
  const measurements = await api<{ measurements: Array<{ id: string; name: string }> }>("/api/measurements", "GET");
  const measByName = new Map(measurements.measurements.map((m) => [m.name, m]));

  const needed = [...PUSH.exercises, ...PULL.exercises, ...LEGS.exercises, ...CARDIO.exercises].map((e) => e.name);
  const missing = needed.filter((n) => !byName.get(n));
  if (missing.length) throw new Error(`Missing exercises: ${missing.join(", ")}`);

  // ---------- plan schedule (past 13 weeks, Mon/Wed/Fri + alt Sat) ----------
  const today = new Date(`${dayKey(new Date())}T00:00:00.000Z`);
  const days: Array<{ date: Date; template: Template; weekIndex: number }> = [];
  const start = addDays(today, -13 * 7); // 13 weeks ago
  let cardioToggle = 0;
  for (let d = new Date(start); d < today; d = addDays(d, 1)) {
    const dow = d.getUTCDay(); // 0 Sun … 6 Sat
    const weekIndex = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
    if (dow === 1) days.push({ date: new Date(d), template: PUSH, weekIndex });
    else if (dow === 3) days.push({ date: new Date(d), template: PULL, weekIndex });
    else if (dow === 5) days.push({ date: new Date(d), template: LEGS, weekIndex });
    else if (dow === 6 && (cardioToggle++ % 2 === 0)) days.push({ date: new Date(d), template: CARDIO, weekIndex });
  }
  console.log(`→ planned ${days.length} workouts over 13 weeks`);

  // ---------- create workouts ----------
  let created = 0;
  let skipped = 0;
  for (const day of days) {
    const key = dayKey(day.date);
    const existing = await api<{ workout: { id: string; exercises: unknown[] } | null }>(`/api/workouts?date=${key}`, "GET");
    if (existing.workout && existing.workout.exercises.length > 0) {
      skipped++;
      continue; // keep whatever is already there
    }
    const workout = existing.workout
      ? ({ id: existing.workout.id } as { id: string })
      : await api<{ id: string }>("/api/workouts", "POST", { date: key });

    const isDeload = day.weekIndex > 0 && day.weekIndex % 5 === 4; // every 5th week
    const startHour = 18 + Math.floor(rand() * 1.5);
    const startMin = Math.floor(rand() * 45);
    const durationMin = 55 + Math.floor(rand() * 30);
    const startAt = `${key}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00.000Z`;
    const endAt = new Date(new Date(startAt).getTime() + durationMin * 60000).toISOString();

    await api(`/api/workouts/${workout.id}`, "PATCH", {
      startAt,
      endAt,
      ...(rand() < 0.35 ? { comment: COMMENTS[Math.floor(rand() * COMMENTS.length)] } : {}),
    });

    for (const ex of day.template.exercises) {
      const meta = byName.get(ex.name)!;
      const added = await api<{ workoutExerciseId: string }>(`/api/workouts/${workout.id}/exercises`, "POST", {
        exerciseId: meta.id,
      });
      const weId = added.workoutExerciseId;

      // cardio: distance + time
      if (meta.type === "DISTANCE_TIME") {
        await api(`/api/workouts/${workout.id}/exercises/${weId}/sets`, "POST", {
          distance: r1(5 + day.weekIndex * 0.15 + noise(0.4)),
          timeSec: Math.round(1680 + noise(90) - day.weekIndex * 6),
          isComplete: true,
        });
        continue;
      }

      const progress = ex.weeklyGain * day.weekIndex;
      const deloadFactor = isDeload ? 0.9 : 1;
      for (let s = 0; s < ex.sets; s++) {
        const reps = Math.max(3, ex.repPattern[s] + Math.round(noise(0.8)));
        if (ex.startWeight === 0) {
          // bodyweight exercise — reps only
          await api(`/api/workouts/${workout.id}/exercises/${weId}/sets`, "POST", {
            reps,
            isComplete: true,
          });
          continue;
        }
        let weight = (ex.startWeight + progress) * deloadFactor + noise(1.2);
        weight = ex.accessory ? r1(weight) : r2d(weight);
        weight = Math.max(weight, 5);
        await api(`/api/workouts/${workout.id}/exercises/${weId}/sets`, "POST", {
          weight,
          reps,
          isComplete: true,
        });
      }
    }
    created++;
    if (created % 8 === 0) console.log(`   … ${created} workouts`);
  }
  console.log(`✓ workouts: ${created} created, ${skipped} skipped (already had data)`)

  // ---------- body measurements ----------
  const bodyWeight = measByName.get("Body Weight");
  const bodyFat = measByName.get("Body Fat");
  let mCount = 0;
  if (bodyWeight && bodyFat) {
    for (let w = 12; w >= 0; w--) {
      const d = addDays(today, -w * 7 + (w === 0 ? -1 : 0));
      if (d >= today) continue;
      const key = dayKey(d);
      await api(`/api/measurements/${bodyWeight.id}/records`, "POST", {
        value: r1(78.2 + (12 - w) * 0.25 + noise(0.4)),
        recordedAt: `${key}T08:00:00.000Z`,
      });
      await api(`/api/measurements/${bodyFat.id}/records`, "POST", {
        value: r1(18.4 - (12 - w) * 0.17 + noise(0.25)),
        recordedAt: `${key}T08:00:00.000Z`,
      });
      mCount += 2;
    }
  }
  console.log(`✓ measurement records: ${mCount}`);

  // ---------- goals ----------
  const goalDefs = [
    { name: "Barbell Bench Press", type: "ONE_RM", targetWeight: 105 },
    { name: "Barbell Squat", type: "MAX_WEIGHT", targetWeight: 140 },
    { name: "Deadlift", type: "ONE_RM", targetWeight: 190 },
  ];
  const existingGoals = await api<{ goals: Array<{ exerciseId: string }> }>("/api/goals", "GET");
  const existingByEx = new Set(existingGoals.goals.map((g) => g.exerciseId));
  let gCount = 0;
  for (const g of goalDefs) {
    const ex = byName.get(g.name)!;
    if (existingByEx.has(ex.id)) continue;
    await api("/api/goals", "POST", { exerciseId: ex.id, type: g.type, targetWeight: g.targetWeight });
    gCount++;
  }
  console.log(`✓ goals: ${gCount} created`);

  // ---------- exercise polish: rest timers + notes on key lifts ----------
  const restDefs: Array<{ name: string; restSec: number; notes?: string }> = [
    { name: "Barbell Bench Press", restSec: 180, notes: "Retract scapula, drive feet, bar to lower chest." },
    { name: "Deadlift", restSec: 240, notes: "Brace hard, push floor away, neutral spine." },
    { name: "Barbell Squat", restSec: 210, notes: "Break at hips and knees together, knees track toes." },
    { name: "Barbell Row", restSec: 150 },
    { name: "Dumbbell Bench Press", restSec: 120 },
    { name: "Lat Pulldown", restSec: 90 },
    { name: "Leg Press", restSec: 150 },
    { name: "Treadmill Run", restSec: 0, notes: "Zone 2 pace — should be able to hold a conversation." },
  ];
  let rCount = 0;
  for (const rd of restDefs) {
    const ex = byName.get(rd.name);
    if (!ex) continue;
    await api(`/api/exercises/${ex.id}`, "PATCH", { restSec: rd.restSec, ...(rd.notes ? { notes: rd.notes } : {}) });
    rCount++;
  }
  console.log(`✓ rest timers / notes set on ${rCount} exercises`);

  // ---------- routines (Push / Pull / Legs + Cardio) ----------
  // Predefined sets target the NEXT progression step after the seeded 13 weeks.
  const nextW = (t: TemplateExercise) => t.startWeight + t.weeklyGain * 13;
  const routineDefs: Array<{ name: string; notes: string; template: Template }> = [
    { name: "Push Day", notes: "Chest · Shoulders · Triceps — heavy compounds first", template: PUSH },
    { name: "Pull Day", notes: "Back · Biceps — deadlift opens the session", template: PULL },
    { name: "Leg Day", notes: "Quads · Hamstrings · Calves", template: LEGS },
    { name: "Conditioning", notes: "Cardio + core finisher", template: CARDIO },
  ];
  type RoutineResp = {
    id: string;
    days: Array<{ id: string; exercises: Array<{ id: string }> }>;
  };
  const createdDays: Array<{ routineName: string; routineId: string; dayId: string }> = [];
  for (const rd of routineDefs) {
    const routine = await api<RoutineResp>("/api/routines", "POST", { name: rd.name, notes: rd.notes });
    let dayResp = await api<RoutineResp>(`/api/routines/${routine.id}/days`, "POST", { name: rd.name });
    const dayId = dayResp.days[dayResp.days.length - 1].id;
    for (const t of rd.template.exercises) {
      const ex = byName.get(t.name)!;
      dayResp = await api<RoutineResp>(`/api/routines/${routine.id}/days/${dayId}/exercises`, "POST", {
        exerciseId: ex.id,
      });
      const reId = dayResp.days[dayResp.days.length - 1].exercises.slice(-1)[0].id;
      if (ex.type === "DISTANCE_TIME") {
        await api(`/api/routines/${routine.id}/days/${dayId}/exercises/${reId}/sets`, "POST", {
          distance: 6.5,
          timeSec: 1620,
        });
      } else if (ex.type === "WEIGHT_REPS" && t.startWeight > 0) {
        for (let s = 0; s < t.sets; s++) {
          await api(`/api/routines/${routine.id}/days/${dayId}/exercises/${reId}/sets`, "POST", {
            weight: t.accessory ? r1(nextW(t)) : r2d(nextW(t)),
            reps: t.repPattern[s],
          });
        }
      } else {
        // bodyweight reps (Hanging Knee Raise)
        for (let s = 0; s < t.sets; s++) {
          await api(`/api/routines/${routine.id}/days/${dayId}/exercises/${reId}/sets`, "POST", {
            reps: t.repPattern[s],
          });
        }
      }
    }
    createdDays.push({ routineName: rd.name, routineId: routine.id, dayId });
    console.log(`✓ routine seeded: ${rd.name}`);
  }

  // ---------- today's workout from the matching routine ----------
  const dow = today.getUTCDay();
  const dayFor: Record<number, string> = { 1: "Push Day", 3: "Pull Day", 5: "Leg Day" };
  const routineName = dayFor[dow] ?? "Push Day";
  const todayDay = createdDays.find((d) => d.routineName === routineName);
  if (todayDay) {
    const key = dayKey(today);
    const existingToday = await api<{ workout: { exercises: unknown[] } | null }>(`/api/workouts?date=${key}`, "GET");
    if (!existingToday.workout || existingToday.workout.exercises.length === 0) {
      await api(`/api/routines/${todayDay.routineId}/log`, "POST", { dayId: todayDay.dayId, date: key });
      console.log(`✓ today's workout seeded from routine "${routineName}" (prefilled blank sets)`);
    } else {
      console.log("→ today already has a workout — leaving it");
    }
  }

  console.log("🎉 demo data seeding complete");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
