import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineExerciseUpdateSchema } from "@/lib/schemas";
import { updateRoutineExercise, removeRoutineExercise } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string; reId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId, reId } = await params;
  const body = await parseBody(req, routineExerciseUpdateSchema);
  return updateRoutineExercise(user.id, id, dayId, reId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId, reId } = await params;
  return removeRoutineExercise(user.id, id, dayId, reId);
});
