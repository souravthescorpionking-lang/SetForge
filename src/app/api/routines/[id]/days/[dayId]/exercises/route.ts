import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineExerciseCreateSchema } from "@/lib/schemas";
import { addRoutineExercise } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId } = await params;
  const body = await parseBody(req, routineExerciseCreateSchema);
  return addRoutineExercise(user.id, id, dayId, body.exerciseId);
});
