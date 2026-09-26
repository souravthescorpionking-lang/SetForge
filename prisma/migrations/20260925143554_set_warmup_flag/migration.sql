-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainingSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "weight" REAL,
    "reps" INTEGER,
    "distance" REAL,
    "timeSec" INTEGER,
    "comment" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TrainingSet" ("comment", "createdAt", "distance", "id", "isComplete", "reps", "sortOrder", "timeSec", "updatedAt", "userId", "weight", "workoutExerciseId") SELECT "comment", "createdAt", "distance", "id", "isComplete", "reps", "sortOrder", "timeSec", "updatedAt", "userId", "weight", "workoutExerciseId" FROM "TrainingSet";
DROP TABLE "TrainingSet";
ALTER TABLE "new_TrainingSet" RENAME TO "TrainingSet";
CREATE INDEX "TrainingSet_workoutExerciseId_idx" ON "TrainingSet"("workoutExerciseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
