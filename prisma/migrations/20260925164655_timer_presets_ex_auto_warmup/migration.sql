-- CreateTable
CREATE TABLE "TimerPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prepareSec" INTEGER NOT NULL DEFAULT 10,
    "workSec" INTEGER NOT NULL DEFAULT 30,
    "restSec" INTEGER NOT NULL DEFAULT 15,
    "rounds" INTEGER NOT NULL DEFAULT 8,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimerPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Exercise" ("barWeight", "categoryId", "createdAt", "defaultGraph", "deletedAt", "id", "isFavorite", "name", "notes", "restSec", "type", "updatedAt", "userId", "weightIncrement", "weightUnit") SELECT "barWeight", "categoryId", "createdAt", "defaultGraph", "deletedAt", "id", "isFavorite", "name", "notes", "restSec", "type", "updatedAt", "userId", "weightIncrement", "weightUnit" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_userId_categoryId_idx" ON "Exercise"("userId", "categoryId");
CREATE UNIQUE INDEX "Exercise_userId_name_key" ON "Exercise"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TimerPreset_userId_name_key" ON "TimerPreset"("userId", "name");
