import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { predefinedSetUpdateSchema } from "@/lib/schemas";
import { updatePredefinedSet, removePredefinedSet } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string; reId: string; setId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId, reId, setId } = await params;
  const body = await parseBody(req, predefinedSetUpdateSchema);
  return updatePredefinedSet(user.id, id, dayId, reId, setId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId, reId, setId } = await params;
  return removePredefinedSet(user.id, id, dayId, reId, setId);
});
