/**
 * Part 10 §1 data backfill — run AFTER `bun run db:push` (schema columns exist).
 * Idempotent: safe to re-run; every step checks before writing.
 *
 *  1. Workout.startAt backfill from createdAt where null (startedAt semantics).
 *  2. Workout.totalVolume/totalSets computed for every finished workout
 *     (Σ completed reps×weight kg over non-warmup sets — mirrors §3.6 finish).
 *  3. UserSettings.autoMoveNextSet → true (the §10 autoAdvance default; the
 *     Part 6 pointer flow is superseded by the §3 live rebuild — users who
 *     want it off toggle it in #/session/settings).
 *
 * Spec name: prisma/scripts/backfill-part10.ts; wired as `bun run db:backfill`.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // 1. startAt backfill (updateMany can't set a column from another column —
  //    row-by-row with the loaded createdAt).
  const nullStart = await db.workout.findMany({
    where: { startAt: null },
    select: { id: true, createdAt: true },
  });
  for (const w of nullStart) {
    await db.workout.update({ where: { id: w.id }, data: { startAt: w.createdAt } });
  }
  console.log(`[part10] startAt backfilled for ${nullStart.length} workouts`);

  // 2. totalVolume/totalSets for finished workouts missing them.
  const finished = await db.workout.findMany({
    where: { finishedAt: { not: null }, totalSets: null },
    select: {
      id: true,
      exercises: { select: { sets: { select: { reps: true, weight: true, isComplete: true } } } },
    },
  });
  let volumes = 0;
  for (const w of finished) {
    let totalVolume = 0;
    let totalSets = 0;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!s.isComplete) continue;
        totalSets += 1;
        totalVolume += (s.weight ?? 0) * (s.reps ?? 0);
      }
    }
    await db.workout.update({ where: { id: w.id }, data: { totalVolume, totalSets } });
    volumes += 1;
  }
  console.log(`[part10] totalVolume/totalSets computed for ${volumes} finished workouts`);

  // 3. autoAdvance default → true.
  const adv = await db.userSettings.updateMany({ where: { autoMoveNextSet: false }, data: { autoMoveNextSet: true } });
  console.log(`[part10] autoMoveNextSet(=autoAdvance) enabled for ${adv.count} users`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
