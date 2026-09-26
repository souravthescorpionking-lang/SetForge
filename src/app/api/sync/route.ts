// Pull-based sync: everything changed for this user since a cursor.
// Offline mutations are replayed through their normal REST endpoints by the client outbox,
// then this endpoint pulls fresh state so caches converge.
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { mapWorkout } from "@/server/mappers";
import { workoutInclude } from "@/server/services/workout-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  const [workouts, measurementRecords, exercises] = await Promise.all([
    db.workout.findMany({
      where: { userId: user.id, updatedAt: { gt: since } },
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
  };
});
