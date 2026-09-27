-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN "catalogKey" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "equipment" JSONB;
ALTER TABLE "Exercise" ADD COLUMN "primaryMuscles" JSONB;
ALTER TABLE "Exercise" ADD COLUMN "secondaryMuscles" JSONB;
ALTER TABLE "Exercise" ADD COLUMN "setupNotes" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "targetNotes" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "trainerTip" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN "estMinutes" INTEGER;
ALTER TABLE "ScheduleEntry" ADD COLUMN "missedAt" DATETIME;
ALTER TABLE "ScheduleEntry" ADD COLUMN "timeOfDay" TEXT;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Workout" ADD COLUMN "discardedAt" DATETIME;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "heightCm" REAL,
    "weightKg" REAL,
    "level" TEXT,
    "goal" TEXT,
    "daysPerWeekTarget" INTEGER,
    "onboardingCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "measurementRecordId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressPhoto_measurementRecordId_fkey" FOREIGN KEY ("measurementRecordId") REFERENCES "MeasurementRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyCalories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kcal" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemCatalog" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WEIGHT_REPS',
    "primaryMuscles" JSONB,
    "secondaryMuscles" JSONB,
    "equipment" JSONB,
    "setupNotes" TEXT,
    "targetNotes" TEXT,
    "trainerTip" TEXT,
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActiveRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "cursorDayIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAdvancedAt" DATETIME,
    "lastAdvancedForDate" TEXT,
    "completedDayIds" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveRoutine_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ActiveRoutine" ("createdAt", "cursorDayIndex", "id", "lastAdvancedAt", "lastAdvancedForDate", "routineId", "startedAt", "updatedAt", "userId") SELECT "createdAt", "cursorDayIndex", "id", "lastAdvancedAt", "lastAdvancedForDate", "routineId", "startedAt", "updatedAt", "userId" FROM "ActiveRoutine";
DROP TABLE "ActiveRoutine";
ALTER TABLE "new_ActiveRoutine" RENAME TO "ActiveRoutine";
CREATE UNIQUE INDEX "ActiveRoutine_userId_key" ON "ActiveRoutine"("userId");
CREATE UNIQUE INDEX "ActiveRoutine_routineId_key" ON "ActiveRoutine"("routineId");
CREATE INDEX "ActiveRoutine_userId_idx" ON "ActiveRoutine"("userId");
CREATE TABLE "new_Routine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ROUTINE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "difficulty" TEXT,
    "phases" JSONB,
    "daysPerWeek" INTEGER,
    "estMinutes" INTEGER,
    "highlights" JSONB,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "labels" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Routine" ("createdAt", "deletedAt", "id", "kind", "name", "notes", "sortOrder", "updatedAt", "userId") SELECT "createdAt", "deletedAt", "id", "kind", "name", "notes", "sortOrder", "updatedAt", "userId" FROM "Routine";
DROP TABLE "Routine";
ALTER TABLE "new_Routine" RENAME TO "Routine";
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");
CREATE TABLE "new_RoutineDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayType" TEXT NOT NULL DEFAULT 'WORKOUT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "primaryMuscles" JSONB,
    "estMinutes" INTEGER,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoutineDay_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RoutineDay" ("createdAt", "dayType", "id", "name", "routineId", "sortOrder", "updatedAt", "userId") SELECT "createdAt", "dayType", "id", "name", "routineId", "sortOrder", "updatedAt", "userId" FROM "RoutineDay";
DROP TABLE "RoutineDay";
ALTER TABLE "new_RoutineDay" RENAME TO "RoutineDay";
CREATE INDEX "RoutineDay_routineId_idx" ON "RoutineDay"("routineId");
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "weekStart" INTEGER NOT NULL DEFAULT 1,
    "defaultWeightIncrement" REAL NOT NULL DEFAULT 2.5,
    "homeSetsShown" INTEGER NOT NULL DEFAULT 3,
    "showCategory" BOOLEAN NOT NULL DEFAULT true,
    "trackPR" BOOLEAN NOT NULL DEFAULT true,
    "markSetsComplete" BOOLEAN NOT NULL DEFAULT false,
    "autoSelectNextSet" BOOLEAN NOT NULL DEFAULT true,
    "keepScreenOn" BOOLEAN NOT NULL DEFAULT false,
    "estOneRmRepLimit" INTEGER NOT NULL DEFAULT 10,
    "weeklyWorkoutTarget" INTEGER NOT NULL DEFAULT 0,
    "showSetType" BOOLEAN NOT NULL DEFAULT true,
    "showRpe" BOOLEAN NOT NULL DEFAULT true,
    "showTempo" BOOLEAN NOT NULL DEFAULT true,
    "showRest" BOOLEAN NOT NULL DEFAULT true,
    "autoRestFromRow" BOOLEAN NOT NULL DEFAULT true,
    "restEndBehaviour" TEXT NOT NULL DEFAULT 'NOTIFY_AND_FOCUS_NEXT',
    "e1rmMethod" TEXT NOT NULL DEFAULT 'BRZYCKI',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "autoAdvanceRest" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMovesCursor" BOOLEAN NOT NULL DEFAULT true,
    "advanceTrigger" TEXT NOT NULL DEFAULT 'FINISH_OR_MIDNIGHT',
    "showProjectedDays" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT,
    "guidedMode" BOOLEAN NOT NULL DEFAULT false,
    "restDisplay" TEXT NOT NULL DEFAULT 'BAR',
    "autoMoveNextSet" BOOLEAN NOT NULL DEFAULT false,
    "hapticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "showVideoPanel" BOOLEAN NOT NULL DEFAULT true,
    "showMuscleChips" BOOLEAN NOT NULL DEFAULT true,
    "showEquipmentChips" BOOLEAN NOT NULL DEFAULT true,
    "finishBehaviour" TEXT NOT NULL DEFAULT 'ALWAYS_SAVE',
    "showSetsProgressBar" BOOLEAN NOT NULL DEFAULT true,
    "showMaxWeightBar" BOOLEAN NOT NULL DEFAULT true,
    "calendarStyle" TEXT NOT NULL DEFAULT 'GRID',
    "tempoPresets" JSONB,
    "showCaloriesCard" BOOLEAN NOT NULL DEFAULT false,
    "showThumbnails" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("advanceTrigger", "autoAdvanceRest", "autoRestFromRow", "autoSelectNextSet", "createdAt", "defaultWeightIncrement", "e1rmMethod", "estOneRmRepLimit", "homeSetsShown", "id", "keepScreenOn", "markSetsComplete", "reminderTime", "restEndBehaviour", "scheduleMovesCursor", "showCategory", "showProjectedDays", "showRest", "showRpe", "showSetType", "showTempo", "theme", "timezone", "trackPR", "unitSystem", "updatedAt", "userId", "weekStart", "weeklyWorkoutTarget") SELECT "advanceTrigger", "autoAdvanceRest", "autoRestFromRow", "autoSelectNextSet", "createdAt", "defaultWeightIncrement", "e1rmMethod", "estOneRmRepLimit", "homeSetsShown", "id", "keepScreenOn", "markSetsComplete", "reminderTime", "restEndBehaviour", "scheduleMovesCursor", "showCategory", "showProjectedDays", "showRest", "showRpe", "showSetType", "showTempo", "theme", "timezone", "trackPR", "unitSystem", "updatedAt", "userId", "weekStart", "weeklyWorkoutTarget" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_userId_idx" ON "ProgressPhoto"("userId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_measurementRecordId_idx" ON "ProgressPhoto"("measurementRecordId");

-- CreateIndex
CREATE INDEX "DailyCalories_userId_date_idx" ON "DailyCalories"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCalories_userId_date_key" ON "DailyCalories"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_userId_catalogKey_key" ON "Exercise"("userId", "catalogKey");

