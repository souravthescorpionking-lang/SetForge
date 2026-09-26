-- Part 2 UI overhaul: new set-level fields (additive, all nullable/defaulted)
ALTER TABLE "TrainingSet" ADD COLUMN "setType" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "TrainingSet" ADD COLUMN "rpe" REAL;
ALTER TABLE "TrainingSet" ADD COLUMN "tempo" TEXT;
ALTER TABLE "TrainingSet" ADD COLUMN "restPlannedSec" INTEGER;
ALTER TABLE "TrainingSet" ADD COLUMN "restActualSec" INTEGER;
ALTER TABLE "TrainingSet" ADD COLUMN "completedAt" DATETIME;

-- Per-exercise set defaults
ALTER TABLE "Exercise" ADD COLUMN "defaultSetType" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "defaultRpeTarget" REAL;
ALTER TABLE "Exercise" ADD COLUMN "defaultTempo" TEXT;

-- Set-table column visibility & behaviour settings
ALTER TABLE "UserSettings" ADD COLUMN "showSetType" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "showRpe" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "showTempo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "showRest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "autoRestFromRow" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "restEndBehaviour" TEXT NOT NULL DEFAULT 'NOTIFY_AND_FOCUS_NEXT';
ALTER TABLE "UserSettings" ADD COLUMN "e1rmMethod" TEXT NOT NULL DEFAULT 'BRZYCKI';

-- Routine predefined-set template fields
ALTER TABLE "PredefinedSet" ADD COLUMN "setType" TEXT;
ALTER TABLE "PredefinedSet" ADD COLUMN "rpe" REAL;
ALTER TABLE "PredefinedSet" ADD COLUMN "tempo" TEXT;
ALTER TABLE "PredefinedSet" ADD COLUMN "restPlannedSec" INTEGER;

-- Backfill: existing warm-up rows get the explicit type tag
UPDATE "TrainingSet" SET "setType" = 'WARMUP' WHERE "isWarmup" = true;
