import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { orderSchema } from "@/lib/schemas";
import { reorderWorkoutExercises } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, orderSchema);
  return reorderWorkoutExercises(user.id, id, body.ids);
});
