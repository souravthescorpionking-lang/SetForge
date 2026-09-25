import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { predefinedSetCreateSchema } from "@/lib/schemas";
import { addPredefinedSet } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string; dayId: string; reId: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, dayId, reId } = await params;
  const body = await parseBody(req, predefinedSetCreateSchema);
  return addPredefinedSet(user.id, id, dayId, reId, body);
});
