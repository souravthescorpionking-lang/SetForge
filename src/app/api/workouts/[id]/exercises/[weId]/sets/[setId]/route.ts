import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setUpdateSchema } from "@/lib/schemas";
import { updateSet, deleteSet } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string; weId: string; setId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId, setId } = await params;
  const body = await parseBody(req, setUpdateSchema);
  return updateSet(user.id, id, weId, setId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId, setId } = await params;
  return deleteSet(user.id, id, weId, setId);
});
