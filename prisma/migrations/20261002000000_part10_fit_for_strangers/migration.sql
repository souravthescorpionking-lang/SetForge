-- Part 10 §0/§1 — Fit for strangers. ONE drop (Challenge/ChallengeDismiss —
-- our own Part 9 §10 addition, superseded by Part 10) + additive columns.
-- Idempotent when applied via `prisma db push`; this file is the portable record.

-- §0 REMOVE: Challenge feature (the ONE allowed drop — own Part 9 addition)
DROP TABLE IF EXISTS "ChallengeDismiss";
DROP TABLE IF EXISTS "Challenge";

-- AlterTable: User += profile fields (§1; fitness level = difficulty, single source)
ALTER TABLE "User" ADD COLUMN "gender" TEXT;
ALTER TABLE "User" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "User" ADD COLUMN "weighInDays" TEXT;
ALTER TABLE "User" ADD COLUMN "stepGoal" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "User" ADD COLUMN "avatarKey" TEXT;

-- AlterTable: UserSettings += WorkoutSettings semantics (§1; autoAdvance =
-- existing autoMoveNextSet, default bumped true by the §1 backfill script)
ALTER TABLE "UserSettings" ADD COLUMN "countdownSounds" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "videoSpeed" REAL NOT NULL DEFAULT 1.0;

-- AlterTable: Workout += finish metadata (§1; startedAt/endedAt = startAt/endAt
-- which already exist; backfill fills startAt from createdAt where null)
ALTER TABLE "Workout" ADD COLUMN "markedComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workout" ADD COLUMN "totalVolume" REAL;
ALTER TABLE "Workout" ADD COLUMN "totalSets" INTEGER;

-- AlterTable: Routine += source (§4: CUSTOM = user-built single workout)
ALTER TABLE "Routine" ADD COLUMN "source" TEXT;

-- CreateTable: StepEntry (§1)
CREATE TABLE "StepEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "steps" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StepEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StepEntry_userId_date_key" ON "StepEntry"("userId", "date");
CREATE INDEX "StepEntry_userId_date_idx" ON "StepEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "StepEntry" ADD CONSTRAINT "StepEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- §1 data backfills (idempotent; also encoded in scripts/qa/backfill-part10.ts
-- for `bun run db:push` environments where this SQL is skipped)
UPDATE "Workout" SET "startAt" = "createdAt" WHERE "startAt" IS NULL;
UPDATE "UserSettings" SET "autoMoveNextSet" = true;
