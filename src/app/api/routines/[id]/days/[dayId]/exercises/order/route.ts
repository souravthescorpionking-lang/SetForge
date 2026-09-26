import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { orderSchema } from "@/lib/schemas";
import { reorderRoutineExercises } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string }> };

export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId } = await params;
  const body = await parseBody(req, orderSchema);
  return reorderRoutineExercises(user.id, id, dayId, body.ids);
});
