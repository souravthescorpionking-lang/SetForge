/**
 * Part 8 §7 data migration — run BEFORE `bun run db:push` (uses the pre-push
 * Prisma client so it can still read DailyCalories / discardedAt / deletedAt).
 *
 *  1. Exports every DailyCalories row to download/calories-export.json
 *     (Law 10: "Calories data exported before drop").
 *  2. Copies Workout.discardedAt / Workout.deletedAt into the new single
 *     remove-semantics pair removedAt / removeReason (§6.9):
 *       discardedAt != null -> removedAt=discardedAt, reason=DISCARDED_SESSION
 *       deletedAt   != null -> removedAt=deletedAt,   reason=USER_DELETE
 *     (discardedAt wins if both are set — it is the stronger signal.)
 *
 * Idempotent: safe to re-run (raw SQL, additive column updates only).
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";

const db = new PrismaClient();

async function main() {
  // 1. Export calories first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calories = await (db as any).dailyCalories.findMany({ orderBy: { date: "asc" } });
  mkdirSync("download", { recursive: true });
  const out = `download/calories-export-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), rows: calories }, null, 2));
  console.log(`Exported ${calories.length} calorie rows -> ${out}`);

  // 2. Remove-semantics migration (columns exist after db:push; before that we
  //    write them via raw SQL guarded by try/catch so re-runs are safe).
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "Workout" ADD COLUMN "removedAt" DATETIME`);
  } catch { /* already exists */ }
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "Workout" ADD COLUMN "removeReason" TEXT`);
  } catch { /* already exists */ }
  const copied = await db.$executeRawUnsafe(`
    UPDATE "Workout" SET
      "removedAt" = COALESCE("discardedAt", "deletedAt"),
      "removeReason" = CASE
        WHEN "discardedAt" IS NOT NULL THEN 'DISCARDED_SESSION'
        WHEN "deletedAt" IS NOT NULL THEN 'USER_DELETE'
        ELSE NULL END
    WHERE ("discardedAt" IS NOT NULL OR "deletedAt" IS NOT NULL)
      AND "removedAt" IS NULL`);
  console.log(`Migrated ${copied} workout rows to remove semantics.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
