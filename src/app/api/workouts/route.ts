import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutCreateSchema } from "@/lib/schemas";
import {
  getWorkoutByDate,
  listWorkouts,
  createOrGetWorkout,
} from "@/server/services/workout-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const dayId = url.searchParams.get("dayId") ?? undefined;
  if (date) {
    const w = await getWorkoutByDate(user.id, date);
    return { workout: w };
  }
  return { workouts: await listWorkouts(user.id, { from, to, search, dayId }) };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, workoutCreateSchema);
  return createOrGetWorkout(user.id, body.date);
});
