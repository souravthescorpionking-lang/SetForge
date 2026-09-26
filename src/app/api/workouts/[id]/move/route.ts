import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutMoveSchema } from "@/lib/schemas";
import { moveWorkout } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, workoutMoveSchema);
  return moveWorkout(user.id, id, body);
});
