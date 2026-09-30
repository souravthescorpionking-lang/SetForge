// ─────────────────────────────────────────────────────────────────────────────
// Part 8 §6.11 — onboarding-driven template. On onboarding Finish the server
// auto-creates + follows the best-matching template (matrix: level × days per
// week). The client shows a toast with Undo → unfollow (routine is kept).
//
// Templates reference SystemCatalog keys; exercises are adopted on demand.
// Predefined sets use copy-last semantics (blank weights) so the first
// session logs real numbers, and progression is off by default.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";

interface TemplateExercise {
  key: string;
  sets: number;
  reps: number;
}

interface TemplateDay {
  name: string;
  exercises: TemplateExercise[];
}

interface Template {
  name: string;
  daysPerWeek: number;
  days: TemplateDay[];
}

const ex = (key: string, sets: number, reps: number): TemplateExercise => ({ key, sets, reps });

/** Matrix: days/week (3/4/5) → split. Level tunes set counts (not the split). */
const TEMPLATES: Record<number, Template> = {
  3: {
    name: "Full Body 3-Day",
    daysPerWeek: 3,
    days: [
      { name: "Full Body A", exercises: [ex("barbell-bench-press", 3, 5), ex("barbell-row", 3, 5), ex("barbell-squat", 3, 5)] },
      { name: "Full Body B", exercises: [ex("incline-dumbbell-press", 3, 8), ex("lat-pulldown", 3, 8), ex("romanian-deadlift", 3, 8)] },
      { name: "Full Body C", exercises: [ex("overhead-press", 3, 5), ex("dumbbell-bulgarian-split-squat", 3, 8), ex("plank", 3, 45)] },
    ],
  },
  4: {
    name: "Upper/Lower 4-Day",
    daysPerWeek: 4,
    days: [
      { name: "Upper Power", exercises: [ex("barbell-bench-press", 4, 5), ex("barbell-row", 4, 5), ex("dumbbell-lateral-raise", 3, 12)] },
      { name: "Lower Power", exercises: [ex("barbell-squat", 4, 5), ex("romanian-deadlift", 3, 6), ex("standing-calf-raise", 3, 12)] },
      { name: "Upper Hypertrophy", exercises: [ex("incline-dumbbell-press", 3, 10), ex("lat-pulldown", 3, 10), ex("dumbbell-curl", 3, 12)] },
      { name: "Lower Hypertrophy", exercises: [ex("leg-press", 3, 10), ex("seated-leg-curl", 3, 12), ex("plank", 3, 45)] },
    ],
  },
  5: {
    name: "PPL 5-Day",
    daysPerWeek: 5,
    days: [
      { name: "Push", exercises: [ex("barbell-bench-press", 4, 5), ex("overhead-press", 3, 8), ex("cable-chest-fly", 3, 12)] },
      { name: "Pull", exercises: [ex("deadlift", 3, 5), ex("lat-pulldown", 3, 8), ex("barbell-curl", 3, 10)] },
      { name: "Legs", exercises: [ex("barbell-squat", 4, 5), ex("leg-press", 3, 10), ex("standing-calf-raise", 4, 12)] },
      { name: "Upper Pump", exercises: [ex("incline-dumbbell-press", 3, 12), ex("seated-cable-row", 3, 12), ex("dumbbell-lateral-raise", 3, 15)] },
      { name: "Core & Conditioning", exercises: [ex("plank", 3, 45), ex("hanging-leg-raise", 3, 12), ex("air-bike", 3, 60)] },
    ],
  },
};

/** Level → set-count multiplier for the main lifts (BEGINNER 0.75 / INTERMEDIATE 1 / ADVANCED 1.25). */
function levelFactor(level: string | null | undefined): number {
  if (level === "ADVANCED") return 1.25;
  if (level === "BEGINNER") return 0.75;
  return 1;
}

/**
 * Create + follow the best-matching template for a user. No-op when the user
 * already follows something. Returns the created routine (id/name/dayCount)
 * or null. Errors are swallowed by the caller (onboarding must never fail
 * because of the template).
 */
export async function startOnboardingTemplate(
  userId: string,
  level: string | null | undefined,
  daysPerWeek: number | null | undefined,
): Promise<{ id: string; name: string; dayCount: number } | null> {
  const active = await db.activeRoutine.findUnique({ where: { userId } });
  if (active) return null; // already following — never override

  const days = daysPerWeek ?? 3;
  const template = TEMPLATES[Math.min(5, Math.max(3, days))] ?? TEMPLATES[3];
  const factor = levelFactor(level);

  // Resolve catalog rows + adopt each exercise (adopt = create a user Exercise
  // from the SystemCatalog entry; idempotent by (userId, catalogKey)).
  const keys = [...new Set(template.days.flatMap((d) => d.exercises.map((e) => e.key)))];
  const catalog = await db.systemCatalog.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  // Every user has a default category to attach to (settings bootstrap); find one.
  const category = await db.category.findFirst({ where: { userId, deletedAt: null }, orderBy: { sortOrder: "asc" } });
  if (!category) return null;

  const exerciseIdByKey = new Map<string, string>();
  for (const key of keys) {
    const cat = byKey.get(key);
    if (!cat) continue;
    // Fresh accounts pre-adopt a starter catalog set — match by catalogKey OR
    // name so we never violate the (userId, name) unique constraint.
    const existing = await db.exercise.findFirst({
      where: { userId, OR: [{ catalogKey: key }, { name: cat.name }] },
    });
    if (existing) {
      exerciseIdByKey.set(key, existing.id);
      continue;
    }
    const created = await db.exercise.create({
      data: {
        id: uuid7(),
        userId,
        categoryId: category.id,
        name: cat.name,
        type: cat.type,
        primaryMuscles: cat.primaryMuscles as never,
        secondaryMuscles: cat.secondaryMuscles as never,
        equipment: cat.equipment as never,
        trainerTip: cat.trainerTip,
        setupNotes: cat.setupNotes,
        targetNotes: cat.targetNotes,
        thumbnailUrl: cat.thumbnailUrl,
        videoUrl: cat.videoUrl,
        catalogKey: key,
      },
    });
    exerciseIdByKey.set(key, created.id);
  }

  const routineId = uuid7();
  await db.routine.create({
    data: {
      id: routineId,
      userId,
      name: template.name,
      kind: "ROUTINE",
      difficulty: level ?? "INTERMEDIATE",
      daysPerWeek: template.daysPerWeek,
      isFavorite: true,
    },
  });

  let daySort = 0;
  for (const day of template.days) {
    const dayId = uuid7();
    await db.routineDay.create({
      data: { id: dayId, userId, routineId, name: day.name, dayType: "WORKOUT", sortOrder: daySort++ },
    });
    let exSort = 0;
    for (const e of day.exercises) {
      const exerciseId = exerciseIdByKey.get(e.key);
      if (!exerciseId) continue;
      const reId = uuid7();
      await db.routineExercise.create({
        data: { id: reId, userId, dayId, exerciseId, sortOrder: exSort++ },
      });
      const setCount = Math.max(1, Math.round(e.sets * factor));
      for (let s = 0; s < setCount; s++) {
        // Copy-last prescriptions: blank weight, fixed reps (first session
        // logs real weights; progression rules can be added per exercise).
        await db.predefinedSet.create({
          data: {
            id: uuid7(),
            routineExerciseId: reId,
            weight: null,
            reps: e.reps,
            weightKind: "COPY_LAST",
            sortOrder: s,
          },
        });
      }
    }
  }

  await db.activeRoutine.create({
    data: { id: uuid7(), userId, routineId, cursorDayIndex: 0 },
  });

  return { id: routineId, name: template.name, dayCount: template.days.length };
}
