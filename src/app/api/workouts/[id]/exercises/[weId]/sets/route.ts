import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setCreateSchema } from "@/lib/schemas";
import { createSet } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string; weId: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId } = await params;
  const body = await parseBody(req, setCreateSchema);
  return createSet(user.id, id, weId, body);
});
