-- CreateTable
CREATE TABLE "ActiveRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "cursorDayIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAdvancedAt" DATETIME,
    "lastAdvancedForDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveRoutine_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "dayId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "workoutId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ScheduleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleEntry_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Routine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ROUTINE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Routine" ("createdAt", "deletedAt", "id", "name", "notes", "sortOrder", "updatedAt", "userId") SELECT "createdAt", "deletedAt", "id", "name", "notes", "sortOrder", "updatedAt", "userId" FROM "Routine";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoutineDay_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RoutineDay" ("createdAt", "id", "name", "routineId", "sortOrder", "updatedAt", "userId") SELECT "createdAt", "id", "name", "routineId", "sortOrder", "updatedAt", "userId" FROM "RoutineDay";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("autoRestFromRow", "autoSelectNextSet", "createdAt", "defaultWeightIncrement", "e1rmMethod", "estOneRmRepLimit", "homeSetsShown", "id", "keepScreenOn", "markSetsComplete", "restEndBehaviour", "showCategory", "showRest", "showRpe", "showSetType", "showTempo", "theme", "trackPR", "unitSystem", "updatedAt", "userId", "weekStart", "weeklyWorkoutTarget") SELECT "autoRestFromRow", "autoSelectNextSet", "createdAt", "defaultWeightIncrement", "e1rmMethod", "estOneRmRepLimit", "homeSetsShown", "id", "keepScreenOn", "markSetsComplete", "restEndBehaviour", "showCategory", "showRest", "showRpe", "showSetType", "showTempo", "theme", "trackPR", "unitSystem", "updatedAt", "userId", "weekStart", "weeklyWorkoutTarget" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "comment" TEXT,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "sourceType" TEXT NOT NULL DEFAULT 'FREESTYLE',
    "sourceRoutineId" TEXT,
    "sourceDayId" TEXT,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Workout_sourceRoutineId_fkey" FOREIGN KEY ("sourceRoutineId") REFERENCES "Routine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_sourceDayId_fkey" FOREIGN KEY ("sourceDayId") REFERENCES "RoutineDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("comment", "createdAt", "date", "endAt", "id", "startAt", "updatedAt", "userId") SELECT "comment", "createdAt", "date", "endAt", "id", "startAt", "updatedAt", "userId" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_userId_date_idx" ON "Workout"("userId", "date");
CREATE INDEX "Workout_userId_sourceRoutineId_idx" ON "Workout"("userId", "sourceRoutineId");
CREATE UNIQUE INDEX "Workout_userId_date_key" ON "Workout"("userId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ActiveRoutine_userId_key" ON "ActiveRoutine"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveRoutine_routineId_key" ON "ActiveRoutine"("routineId");

-- CreateIndex
CREATE INDEX "ActiveRoutine_userId_idx" ON "ActiveRoutine"("userId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_userId_date_idx" ON "ScheduleEntry"("userId", "date");

-- CreateIndex (partial, hand-written: at most one PLANNED entry per user/date)
CREATE UNIQUE INDEX "ScheduleEntry_userId_date_planned_key" ON "ScheduleEntry"("userId", "date") WHERE "status" = 'PLANNED' AND "deletedAt" IS NULL;
