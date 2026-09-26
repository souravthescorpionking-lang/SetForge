import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutExerciseUpdateSchema } from "@/lib/schemas";
import { updateWorkoutExercise, removeWorkoutExercise } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string; weId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId } = await params;
  const body = await parseBody(req, workoutExerciseUpdateSchema);
  return updateWorkoutExercise(user.id, id, weId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId } = await params;
  return removeWorkoutExercise(user.id, id, weId);
});
