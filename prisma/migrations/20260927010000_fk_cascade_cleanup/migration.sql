-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "type" TEXT NOT NULL DEFAULT 'WEIGHT_REPS',
    "weightUnit" TEXT,
    "weightIncrement" REAL,
    "restSec" INTEGER,
    "defaultGraph" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "barWeight" REAL,
    "autoWarmup" BOOLEAN NOT NULL DEFAULT false,
    "defaultSetType" TEXT,
    "defaultRpeTarget" REAL,
    "defaultTempo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Exercise" ("autoWarmup", "barWeight", "categoryId", "createdAt", "defaultGraph", "defaultRpeTarget", "defaultSetType", "defaultTempo", "deletedAt", "id", "isFavorite", "name", "notes", "restSec", "type", "updatedAt", "userId", "weightIncrement", "weightUnit") SELECT "autoWarmup", "barWeight", "categoryId", "createdAt", "defaultGraph", "defaultRpeTarget", "defaultSetType", "defaultTempo", "deletedAt", "id", "isFavorite", "name", "notes", "restSec", "type", "updatedAt", "userId", "weightIncrement", "weightUnit" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_userId_categoryId_idx" ON "Exercise"("userId", "categoryId");
CREATE UNIQUE INDEX "Exercise_userId_name_key" ON "Exercise"("userId", "name");
CREATE TABLE "new_Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goalType" TEXT NOT NULL DEFAULT 'NONE',
    "targetValue" REAL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Measurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Measurement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "MeasurementUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Measurement" ("createdAt", "goalType", "id", "isDefault", "isEnabled", "name", "sortOrder", "targetValue", "unitId", "updatedAt", "userId") SELECT "createdAt", "goalType", "id", "isDefault", "isEnabled", "name", "sortOrder", "targetValue", "unitId", "updatedAt", "userId" FROM "Measurement";
DROP TABLE "Measurement";
ALTER TABLE "new_Measurement" RENAME TO "Measurement";
CREATE INDEX "Measurement_userId_idx" ON "Measurement"("userId");
CREATE UNIQUE INDEX "Measurement_userId_name_key" ON "Measurement"("userId", "name");
CREATE TABLE "new_RoutineExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoutineExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoutineExercise_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RoutineGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoutineExercise" ("createdAt", "dayId", "exerciseId", "groupId", "id", "sortOrder", "updatedAt", "userId") SELECT "createdAt", "dayId", "exerciseId", "groupId", "id", "sortOrder", "updatedAt", "userId" FROM "RoutineExercise";
DROP TABLE "RoutineExercise";
ALTER TABLE "new_RoutineExercise" RENAME TO "RoutineExercise";
CREATE INDEX "RoutineExercise_dayId_idx" ON "RoutineExercise"("dayId");
CREATE INDEX "RoutineExercise_exerciseId_idx" ON "RoutineExercise"("exerciseId");
CREATE TABLE "new_WorkoutExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutExercise_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkoutGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkoutExercise" ("createdAt", "exerciseId", "groupId", "id", "sortOrder", "updatedAt", "userId", "workoutId") SELECT "createdAt", "exerciseId", "groupId", "id", "sortOrder", "updatedAt", "userId", "workoutId" FROM "WorkoutExercise";
DROP TABLE "WorkoutExercise";
ALTER TABLE "new_WorkoutExercise" RENAME TO "WorkoutExercise";
CREATE INDEX "WorkoutExercise_workoutId_idx" ON "WorkoutExercise"("workoutId");
CREATE INDEX "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise"("exerciseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

