/**
 * Part 9 §1 data migration — run AFTER `bun run db:push` (schema columns exist).
 * Idempotent: safe to re-run; every step checks before writing.
 *
 *  1. Every ROUTINE-kind routine without variants gets the variant → phase tree:
 *     - name-matched seeded templates → ALL template variants materialized;
 *       the legacy-difficulty variant absorbs the EXISTING days (ids kept);
 *     - custom programs → 1 variant at routine.difficulty ?? INTERMEDIATE with
 *       a single "Main" phase holding the existing days.
 *  2. SESSION-kind routines (on-demand) get §7 metadata from the template
 *     (intensity / equipmentLevel / categories / isFeatured / durationBand).
 *  3. DayFavorite backfill from the legacy RoutineDay.isFavorite flag.
 *  4. User.difficulty backfill from UserProfile.level (default INTERMEDIATE).
 *  5. Exercise.altGroup backfill for key movement families (§5.2 suggestions).
 *  6. One active Challenge seeded (global) if none exists — variant of the
 *     oldest user's "Push / Pull / Legs" INTERMEDIATE copy.
 */
import { PrismaClient } from "@prisma/client";
import { PROGRAM_TEMPLATES, templateVariants, durationBandFor } from "../src/server/seed";
import { randomUUID } from "node:crypto";

const db = new PrismaClient();

// (name → alternation family) for §5.2 Replace suggestions.
const ALT_GROUPS: Record<string, string> = {};
const families: [string, string[]][] = [
  ["horizontal-press", ["Barbell Bench Press", "Incline Dumbbell Press", "Dumbbell Bench Press", "Machine Chest Press", "Wide-Grip Bench Press", "Decline Dumbbell Press", "Smith Machine Bench Press"]],
  ["vertical-press", ["Overhead Press", "Dumbbell Shoulder Press", "Machine Shoulder Press", "Seated Overhead Press", "Push Press", "Arnold Press"]],
  ["horizontal-pull", ["Barbell Row", "Seated Cable Row", "T-Bar Row", "Machine Row", "Underhand Barbell Row", "Wide-Grip Seated Cable Row"]],
  ["vertical-pull", ["Lat Pulldown", "Pull-Up", "Weighted Pull-Up", "Chin-Up", "Close-Grip Lat Pulldown", "Wide-Grip Lat Pulldown"]],
  ["squat", ["Barbell Squat", "Front Squat", "Hack Squat", "Leg Press", "Smith Machine Squat", "Goblet Squat", "Box Squat"]],
  ["hinge", ["Romanian Deadlift", "Deadlift", "Stiff-Leg Deadlift", "Dumbbell Romanian Deadlift", "Sumo Deadlift", "Trap Bar Deadlift"]],
  ["lateral-raise", ["Lateral Raise", "Machine Lateral Raise", "Cable Lateral Raise", "Band Lateral Raise", "Seated Lateral Raise"]],
  ["curl", ["Barbell Curl", "EZ-Bar Curl", "Hammer Curl", "Dumbbell Curl", "Preacher Curl", "Cable Curl", "Incline Dumbbell Curl"]],
  ["pushdown", ["Cable Pushdown", "Rope Pushdown", "V-Bar Pushdown", "Skull Crusher", "EZ-Bar Skull Crusher", "Dumbbell Skull Crusher"]],
  ["calf-raise", ["Standing Calf Raise", "Seated Calf Raise", "Barbell Standing Calf Raise", "Dumbbell Standing Calf Raise", "Leg Press Calf Raise"]],
  ["core", ["Plank", "Crunch", "Hanging Leg Raise", "Russian Twist", "Dead Bug", "Bird Dog", "Hollow Body Hold"]],
];
for (const [group, names] of families) for (const n of names) ALT_GROUPS[n] = group;

async function migrateRoutines() {
  const routines = await db.routine.findMany({ include: { days: { orderBy: { sortOrder: "asc" } }, variants: true } });
  let variantTrees = 0;
  let sessionMeta = 0;

  for (const r of routines) {
    const template = PROGRAM_TEMPLATES.find((t) => t.name === r.name);
    if ((r.kind ?? "ROUTINE") === "ROUTINE") {
      if (r.variants.length > 0) continue; // already migrated

      if (template) {
        // Seed rule: existing program → variant at legacy difficulty + 1 phase + existing days,
        // plus every sibling variant from the template (days materialized fresh).
        const variants = templateVariants(template);
        const legacyDifficulty = r.difficulty ?? template.difficulty ?? "INTERMEDIATE";
        let running = 0;
        for (const v of variants) {
          const variantId = randomUUID();
          await db.programVariant.create({
            data: {
              id: variantId,
              routineId: r.id,
              difficulty: v.difficulty,
              daysPerWeek: v.daysPerWeek,
              equipment: v.equipment ? JSON.stringify(v.equipment) : undefined,
            },
          });
          for (const [phi, ph] of v.phases.entries()) {
            const phaseId = randomUUID();
            await db.programPhase.create({
              data: {
                id: phaseId,
                variantId,
                idx: phi,
                name: ph.name,
                overview: ph.overview ?? undefined,
                minutesMin: ph.minutesMin ?? undefined,
                minutesMax: ph.minutesMax ?? undefined,
              },
            });
            if (v.difficulty === legacyDifficulty && phi === 0) {
              // Absorb the EXISTING days into the legacy variant's first phase.
              for (const d of r.days) {
                await db.routineDay.update({ where: { id: d.id }, data: { phaseId, sortOrder: running } });
                running += 1;
              }
            } else {
              // Fresh days for sibling variants (exercises resolved per user by name).
              const exerciseIdByName = new Map(
                (await db.exercise.findMany({ where: { userId: r.userId }, select: { id: true, name: true } })).map((e) => [e.name, e.id]),
              );
              for (const d of ph.days) {
                const dayId = randomUUID();
                await db.routineDay.create({
                  data: { id: dayId, userId: r.userId, routineId: r.id, name: d.name, dayType: d.dayType, sortOrder: running, phaseId },
                });
                running += 1;
                let ei = 0;
                for (const ex of d.exercises) {
                  const exerciseId = exerciseIdByName.get(ex.name);
                  if (!exerciseId) continue;
                  const reId = randomUUID();
                  await db.routineExercise.create({
                    data: { id: reId, userId: r.userId, dayId, exerciseId, sortOrder: ei++ },
                  });
                  if (ex.sets.length > 0) {
                    await db.predefinedSet.createMany({
                      data: ex.sets.map((ps, i) => ({
                        id: randomUUID(),
                        routineExerciseId: reId,
                        weight: ps.weight ?? null,
                        reps: ps.reps ?? null,
                        distance: ps.distance ?? null,
                        timeSec: ps.timeSec ?? null,
                        setType: ps.setType ?? null,
                        rpe: ps.rpe ?? null,
                        tempo: ps.tempo ?? null,
                        restPlannedSec: ps.restPlannedSec ?? null,
                        isAmrap: ps.setType === "AMRAP",
                        sortOrder: i,
                      })),
                    });
                  }
                }
              }
            }
          }
          // Template template-level fields (idempotent: only fill nulls).
          await db.routine.update({
            where: { id: r.id },
            data: {
              tagline: r.tagline ?? template.tagline ?? null,
              description: r.description ?? template.description ?? null,
              weeks: r.weeks ?? template.weeks ?? null,
            },
          });
          variantTrees += 1;
        }
      } else {
        // Custom program: 1 variant + 1 phase with the existing days.
        const variantId = randomUUID();
        const phaseId = randomUUID();
        const difficulty = r.difficulty ?? "INTERMEDIATE";
        await db.programVariant.create({ data: { id: variantId, routineId: r.id, difficulty, daysPerWeek: r.daysPerWeek ?? 3 } });
        await db.programPhase.create({ data: { id: phaseId, variantId, idx: 0, name: "Main" } });
        let running = 0;
        for (const d of r.days) {
          await db.routineDay.update({ where: { id: d.id }, data: { phaseId, sortOrder: running++ } });
        }
        variantTrees += 1;
      }
    } else if (template) {
      // SESSION (on-demand) metadata from the template.
      const patch: Record<string, unknown> = {};
      if (r.intensity == null && template.intensity) patch.intensity = template.intensity;
      if (r.equipmentLevel == null && template.equipmentLevel) patch.equipmentLevel = template.equipmentLevel;
      if (r.categories == null && template.categories) patch.categories = JSON.stringify(template.categories);
      if (!r.isFeatured && template.isFeatured) patch.isFeatured = true;
      const band = r.durationBand ?? durationBandFor(r.estMinutes ?? template.estMinutes ?? null);
      if (r.durationBand == null && band) patch.durationBand = band;
      if (r.tagline == null && template.tagline) patch.tagline = template.tagline;
      if (r.description == null && template.notes) patch.description = template.notes;
      if (Object.keys(patch).length > 0) {
        await db.routine.update({ where: { id: r.id }, data: patch });
        sessionMeta += 1;
      }
    } else {
      const band = r.durationBand ?? durationBandFor(r.estMinutes);
      if (band && r.durationBand == null) {
        await db.routine.update({ where: { id: r.id }, data: { durationBand: band } });
        sessionMeta += 1;
      }
    }
  }
  console.log(`[part9] variant trees created: ${variantTrees}; session metadata patches: ${sessionMeta}`);
}

async function migrateFavorites() {
  const favDays = await db.routineDay.findMany({ where: { isFavorite: true }, select: { id: true, userId: true } });
  let created = 0;
  for (const d of favDays) {
    const exists = await db.dayFavorite.findUnique({ where: { userId_dayId: { userId: d.userId, dayId: d.id } } });
    if (!exists) {
      await db.dayFavorite.create({ data: { userId: d.userId, dayId: d.id } });
      created += 1;
    }
  }
  console.log(`[part9] DayFavorite rows backfilled: ${created}`);
}

async function migrateUserDifficulty() {
  const res = await db.$executeRawUnsafe(`
    UPDATE "User" SET "difficulty" = COALESCE((
      SELECT "level" FROM "UserProfile" WHERE "UserProfile"."userId" = "User"."id"
    ), 'INTERMEDIATE')
    WHERE "difficulty" = 'INTERMEDIATE'`);
  console.log(`[part9] user difficulty rows touched: ${res}`);
}

async function migrateAltGroups() {
  let touched = 0;
  for (const [name, group] of Object.entries(ALT_GROUPS)) {
    const res = await db.exercise.updateMany({ where: { name, altGroup: null }, data: { altGroup: group } });
    touched += res.count;
  }
  console.log(`[part9] exercise altGroup rows set: ${touched}`);
}

/** Materialize a full template program for a user (mirrors the signup seed). */
async function materializeTemplateProgram(userId: string, t: (typeof PROGRAM_TEMPLATES)[number], sortOrder: number) {
  const routineId = randomUUID();
  const exerciseIdByName = new Map(
    (await db.exercise.findMany({ where: { userId }, select: { id: true, name: true } })).map((e) => [e.name, e.id]),
  );
  await db.routine.create({
    data: {
      id: routineId,
      userId,
      name: t.name,
      notes: t.notes,
      kind: t.kind,
      sortOrder,
      difficulty: t.difficulty ?? undefined,
      daysPerWeek: t.daysPerWeek ?? undefined,
      estMinutes: t.estMinutes ?? undefined,
      highlights: t.highlights ? JSON.stringify(t.highlights) : undefined,
      tagline: t.tagline ?? undefined,
      description: t.description ?? undefined,
      weeks: t.weeks ?? undefined,
      intensity: t.intensity ?? undefined,
      equipmentLevel: t.equipmentLevel ?? undefined,
      categories: t.categories ? JSON.stringify(t.categories) : undefined,
      isFeatured: t.isFeatured ?? undefined,
      durationBand: durationBandFor(t.estMinutes ?? null) ?? undefined,
    },
  });
  if (t.kind === "SESSION") {
    let di = 0;
    for (const d of t.days) {
      const dayId = randomUUID();
      await db.routineDay.create({ data: { id: dayId, userId, routineId, name: d.name, dayType: d.dayType, sortOrder: di++ } });
      let ei = 0;
      for (const ex of d.exercises) {
        const exerciseId = exerciseIdByName.get(ex.name);
        if (!exerciseId) continue;
        const reId = randomUUID();
        await db.routineExercise.create({ data: { id: reId, userId, dayId, exerciseId, sortOrder: ei++ } });
        if (ex.sets.length > 0) {
          await db.predefinedSet.createMany({
            data: ex.sets.map((ps, i) => ({
              id: randomUUID(),
              routineExerciseId: reId,
              weight: ps.weight ?? null, reps: ps.reps ?? null, distance: ps.distance ?? null,
              timeSec: ps.timeSec ?? null, setType: ps.setType ?? null, rpe: ps.rpe ?? null,
              tempo: ps.tempo ?? null, restPlannedSec: ps.restPlannedSec ?? null,
              isAmrap: ps.setType === "AMRAP", sortOrder: i,
            })),
          });
        }
      }
    }
    return routineId;
  }
  for (const v of templateVariants(t)) {
    const variantId = randomUUID();
    await db.programVariant.create({
      data: { id: variantId, routineId, difficulty: v.difficulty, daysPerWeek: v.daysPerWeek, equipment: v.equipment ? JSON.stringify(v.equipment) : undefined },
    });
    let running = 0;
    for (const [phi, ph] of v.phases.entries()) {
      const phaseId = randomUUID();
      await db.programPhase.create({
        data: { id: phaseId, variantId, idx: phi, name: ph.name, overview: ph.overview ?? undefined, minutesMin: ph.minutesMin ?? undefined, minutesMax: ph.minutesMax ?? undefined },
      });
      for (const d of ph.days) {
        const dayId = randomUUID();
        await db.routineDay.create({ data: { id: dayId, userId, routineId, name: d.name, dayType: d.dayType, sortOrder: running++, phaseId } });
        let ei = 0;
        for (const ex of d.exercises) {
          const exerciseId = exerciseIdByName.get(ex.name);
          if (!exerciseId) continue;
          const reId = randomUUID();
          await db.routineExercise.create({ data: { id: reId, userId, dayId, exerciseId, sortOrder: ei++ } });
          if (ex.sets.length > 0) {
            await db.predefinedSet.createMany({
              data: ex.sets.map((ps, i) => ({
                id: randomUUID(),
                routineExerciseId: reId,
                weight: ps.weight ?? null, reps: ps.reps ?? null, distance: ps.distance ?? null,
                timeSec: ps.timeSec ?? null, setType: ps.setType ?? null, rpe: ps.rpe ?? null,
                tempo: ps.tempo ?? null, restPlannedSec: ps.restPlannedSec ?? null,
                isAmrap: ps.setType === "AMRAP", sortOrder: i,
              })),
            });
          }
        }
      }
    }
  }
  return routineId;
}

/** Users created outside signup (demo/QA scripts) missed the template programs — backfill them. */
async function ensureTemplatePrograms() {
  const users = await db.user.findMany({ select: { id: true } });
  let created = 0;
  for (const u of users) {
    // Include soft-deleted routines in the name check: a user who deleted a
    // template must NOT get it re-created.
    const names = new Set((await db.routine.findMany({ where: { userId: u.id }, select: { name: true } })).map((r) => r.name));
    let sortOrder = await db.routine.count({ where: { userId: u.id } });
    for (const t of PROGRAM_TEMPLATES) {
      if (names.has(t.name)) continue;
      await materializeTemplateProgram(u.id, t, sortOrder++);
      created += 1;
    }
  }
  console.log(`[part9] missing template programs materialized: ${created}`);
}

async function seedChallenge() {
  const existing = await db.challenge.findFirst({ where: { isActive: true } });
  if (existing) {
    console.log(`[part9] active challenge already present: ${existing.name}`);
    return;
  }
  // Variant of the oldest user's "Push / Pull / Legs" INTERMEDIATE copy.
  const routine = await db.routine.findFirst({
    where: { name: "Push / Pull / Legs", kind: "ROUTINE" },
    orderBy: { createdAt: "asc" },
    include: { variants: true },
  });
  const variant = routine?.variants.find((v) => v.difficulty === "INTERMEDIATE") ?? routine?.variants[0];
  if (!routine || !variant) {
    console.log("[part9] no PPL routine found — challenge skipped (fresh DBs seed on first signup)");
    return;
  }
  const startsOn = new Date();
  startsOn.setUTCHours(0, 0, 0, 0);
  startsOn.setUTCDate(startsOn.getUTCDate() + 3); // starts in 3 days
  await db.challenge.create({
    data: {
      id: randomUUID(),
      name: "Autumn Strength Reset",
      startsOn,
      weeks: 4,
      programVariantId: variant.id,
      isActive: true,
    },
  });
  console.log(`[part9] challenge seeded: Autumn Strength Reset (routine ${routine.id}, variant ${variant.difficulty})`);
}

async function main() {
  await migrateRoutines();
  await ensureTemplatePrograms();
  await migrateFavorites();
  await migrateUserDifficulty();
  await migrateAltGroups();
  await seedChallenge();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
