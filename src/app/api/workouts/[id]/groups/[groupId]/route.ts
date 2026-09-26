import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { groupUpdateSchema } from "@/lib/schemas";
import { updateGroup, deleteGroup } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string; groupId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, groupId } = await params;
  const body = await parseBody(req, groupUpdateSchema);
  return updateGroup(user.id, id, groupId, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, groupId } = await params;
  return deleteGroup(user.id, id, groupId);
});
