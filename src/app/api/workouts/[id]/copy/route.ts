import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutCopySchema } from "@/lib/schemas";
import { copyWorkout } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, workoutCopySchema);
  return copyWorkout(user.id, id, body);
});
