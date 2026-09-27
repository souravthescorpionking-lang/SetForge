import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setUpdateSchema } from "@/lib/schemas";
import { updateSet, deleteSet } from "@/server/services/workout-service";
import { notifySetSaved } from "@/server/services/program-service";

type Ctx = { params: Promise<{ id: string; weId: string; setId: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId, setId } = await params;
  const body = await parseBody(req, setUpdateSchema);
  const result = await updateSet(user.id, id, weId, setId, body);
  // Part 5 FIRST_SET trigger: advance the cursor when the first set is saved
  await notifySetSaved(user.id, id).catch(() => undefined);
  return result;
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId, setId } = await params;
  return deleteSet(user.id, id, weId, setId);
});
