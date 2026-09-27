// Pull-based sync: everything changed for this user since a cursor.
// Offline mutations are replayed through their normal REST endpoints by the client outbox,
// then this endpoint pulls fresh state so caches converge.
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { mapWorkout, mapScheduleEntry } from "@/server/mappers";
import { workoutInclude } from "@/server/services/workout-service";
import { applyProgramRules } from "@/server/services/program-service";
import { jsonStringArray } from "@/server/media";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  // converge the program cursor before pulling (REST catch-up, midnight rules)
  await applyProgramRules(user.id);

  const [workouts, measurementRecords, exercises, scheduleEntries, activeRoutine, userProfile, dailyCalories] = await Promise.all([
    db.workout.findMany({
      where: { userId: user.id, updatedAt: { gt: since }, deletedAt: null },
      include: workoutInclude,
      orderBy: { updatedAt: "asc" },
    }),
    db.measurementRecord.findMany({
      where: { userId: user.id, updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
    }),
    db.exercise.findMany({
      where: { userId: user.id, updatedAt: { gt: since } },
      include: { category: true },
    }),
    db.scheduleEntry.findMany({
      where: { userId: user.id, updatedAt: { gt: since }, deletedAt: null },
      include: { routine: true, day: true },
      orderBy: { updatedAt: "asc" },
    }),
    db.activeRoutine.findUnique({ where: { userId: user.id }, include: { routine: true } }),
    db.userProfile.findUnique({ where: { userId: user.id } }),
    db.dailyCalories.findMany({
      where: { userId: user.id, updatedAt: { gt: since } },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  return {
    serverTime: new Date().toISOString(),
    workouts: workouts.map(mapWorkout),
    measurementRecords: measurementRecords.map((r) => ({
      id: r.id,
      measurementId: r.measurementId,
      value: r.value,
      recordedAt: r.recordedAt.toISOString(),
      comment: r.comment ?? null,
    })),
    exerciseIdsChanged: exercises.map((e) => e.id),
    scheduleEntries: scheduleEntries.map(mapScheduleEntry),
    activeRoutine: activeRoutine
      ? {
          routineId: activeRoutine.routineId,
          routineName: activeRoutine.routine.name,
          cursorDayIndex: activeRoutine.cursorDayIndex,
          startedAt: activeRoutine.startedAt.toISOString(),
          lastAdvancedAt: activeRoutine.lastAdvancedAt?.toISOString() ?? null,
          lastAdvancedForDate: activeRoutine.lastAdvancedForDate,
          completedDayIds: jsonStringArray(activeRoutine.completedDayIds), // Part 6
        }
      : null,
    // ---- Part 6 ----
    userProfile: userProfile
      ? {
          age: userProfile.age ?? null,
          heightCm: userProfile.heightCm ?? null,
          weightKg: userProfile.weightKg ?? null,
          level: userProfile.level ?? null,
          goal: userProfile.goal ?? null,
          daysPerWeekTarget: userProfile.daysPerWeekTarget ?? null,
          onboardingCompletedAt: userProfile.onboardingCompletedAt?.toISOString() ?? null,
        }
      : null,
    dailyCalories: dailyCalories.map((c) => ({
      date: c.date.toISOString().slice(0, 10),
      kcal: c.kcal,
      note: c.note ?? null,
    })),
  };
});
