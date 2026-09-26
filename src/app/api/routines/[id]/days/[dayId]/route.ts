import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineDayUpdateSchema } from "@/lib/schemas";
import { updateRoutineDay, deleteRoutineDay } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId } = await params;
  const body = await parseBody(req, routineDayUpdateSchema);
  return updateRoutineDay(user.id, id, dayId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId } = await params;
  return deleteRoutineDay(user.id, id, dayId);
});
