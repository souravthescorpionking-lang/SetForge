import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutExerciseAddSchema } from "@/lib/schemas";
import { addWorkoutExercise } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, workoutExerciseAddSchema);
  return addWorkoutExercise(user.id, id, body.exerciseId);
});
