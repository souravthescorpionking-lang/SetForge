-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "scheduledStart" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Workout_sourceRoutineId_fkey" FOREIGN KEY ("sourceRoutineId") REFERENCES "Routine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_sourceDayId_fkey" FOREIGN KEY ("sourceDayId") REFERENCES "RoutineDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("comment", "createdAt", "date", "endAt", "finishedAt", "id", "sourceDayId", "sourceRoutineId", "sourceType", "startAt", "updatedAt", "userId") SELECT "comment", "createdAt", "date", "endAt", "finishedAt", "id", "sourceDayId", "sourceRoutineId", "sourceType", "startAt", "updatedAt", "userId" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_userId_date_idx" ON "Workout"("userId", "date");
CREATE INDEX "Workout_userId_sourceRoutineId_idx" ON "Workout"("userId", "sourceRoutineId");
CREATE UNIQUE INDEX "Workout_userId_date_key" ON "Workout"("userId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
