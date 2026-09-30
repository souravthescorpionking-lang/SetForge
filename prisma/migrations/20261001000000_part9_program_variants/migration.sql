-- Part 9 §1 — Programs, Variants, Phases, Overrides, On-demand metadata,
-- Challenge, Support. ADDITIVE ONLY (Law: migrations add, never drop).
-- Idempotent when applied via `prisma db push`; this file is the portable record.

-- AlterTable: User += difficulty, deletedAt (§1, §9 soft delete)
ALTER TABLE "User" ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'INTERMEDIATE';
ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable: Routine += Program template fields (§1) + OnDemandWorkout metadata (§7)
ALTER TABLE "Routine" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Routine" ADD COLUMN "description" TEXT;
ALTER TABLE "Routine" ADD COLUMN "weeks" INTEGER;
ALTER TABLE "Routine" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Routine" ADD COLUMN "intensity" TEXT;
ALTER TABLE "Routine" ADD COLUMN "durationBand" TEXT;
ALTER TABLE "Routine" ADD COLUMN "equipmentLevel" TEXT;
ALTER TABLE "Routine" ADD COLUMN "categories" JSONB;
ALTER TABLE "Routine" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: RoutineDay += phaseId, equipment (§1)
ALTER TABLE "RoutineDay" ADD COLUMN "phaseId" TEXT;
ALTER TABLE "RoutineDay" ADD COLUMN "equipment" JSONB;

-- AlterTable: RoutineExercise += tip, restNone (§1 SeriesExercise)
ALTER TABLE "RoutineExercise" ADD COLUMN "tip" TEXT;
ALTER TABLE "RoutineExercise" ADD COLUMN "restNone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: PredefinedSet += isAmrap (§1)
ALTER TABLE "PredefinedSet" ADD COLUMN "isAmrap" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: ActiveRoutine += variantId, cursorPhaseIdx (§1 variant cursor)
ALTER TABLE "ActiveRoutine" ADD COLUMN "variantId" TEXT;
ALTER TABLE "ActiveRoutine" ADD COLUMN "cursorPhaseIdx" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: ScheduleEntry += markedOff (§1)
ALTER TABLE "ScheduleEntry" ADD COLUMN "markedOff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Workout += sourceLabel, difficulty, durationSec (§1 Log provenance)
ALTER TABLE "Workout" ADD COLUMN "sourceLabel" TEXT;
ALTER TABLE "Workout" ADD COLUMN "difficulty" TEXT;
ALTER TABLE "Workout" ADD COLUMN "durationSec" INTEGER;

-- AlterTable: Exercise += position, altGroup (§1)
ALTER TABLE "Exercise" ADD COLUMN "position" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "altGroup" TEXT;

-- CreateTable: ProgramVariant (§1)
CREATE TABLE "ProgramVariant" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "daysPerWeek" INTEGER NOT NULL DEFAULT 3,
    "equipment" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgramVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgramVariant_routineId_difficulty_key" ON "ProgramVariant"("routineId", "difficulty");
CREATE INDEX "ProgramVariant_routineId_idx" ON "ProgramVariant"("routineId");

-- CreateTable: ProgramPhase (§1)
CREATE TABLE "ProgramPhase" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "overview" TEXT,
    "minutesMin" INTEGER,
    "minutesMax" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgramPhase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgramPhase_variantId_idx" ON "ProgramPhase"("variantId");

-- CreateTable: PhaseOverride (§1 §4)
CREATE TABLE "PhaseOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "dayOrder" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhaseOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhaseOverride_userId_phaseId_key" ON "PhaseOverride"("userId", "phaseId");

-- CreateTable: DayOverride (§1 §5)
CREATE TABLE "DayOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "seriesOrder" JSONB,
    "replacements" JSONB,
    "notes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DayOverride_userId_dayId_key" ON "DayOverride"("userId", "dayId");

-- CreateTable: DayFavorite (§1 §5 §7)
CREATE TABLE "DayFavorite" (
    "userId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayFavorite_pkey" PRIMARY KEY ("userId", "dayId")
);
CREATE INDEX "DayFavorite_userId_idx" ON "DayFavorite"("userId");

-- CreateTable: Challenge (§1 §10)
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATETIME NOT NULL,
    "weeks" INTEGER NOT NULL DEFAULT 4,
    "programVariantId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Challenge_isActive_idx" ON "Challenge"("isActive");

-- CreateTable: ChallengeDismiss (§1 §10)
CREATE TABLE "ChallengeDismiss" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChallengeDismiss_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChallengeDismiss_userId_challengeId_key" ON "ChallengeDismiss"("userId", "challengeId");

-- CreateTable: SupportTicket (§1 §9)
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoutineDay" ADD CONSTRAINT "RoutineDay_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProgramPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgramVariant" ADD CONSTRAINT "ProgramVariant_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramPhase" ADD CONSTRAINT "ProgramPhase_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProgramVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhaseOverride" ADD CONSTRAINT "PhaseOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhaseOverride" ADD CONSTRAINT "PhaseOverride_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProgramPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayFavorite" ADD CONSTRAINT "DayFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayFavorite" ADD CONSTRAINT "DayFavorite_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_programVariantId_fkey" FOREIGN KEY ("programVariantId") REFERENCES "ProgramVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeDismiss" ADD CONSTRAINT "ChallengeDismiss_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeDismiss" ADD CONSTRAINT "ChallengeDismiss_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
