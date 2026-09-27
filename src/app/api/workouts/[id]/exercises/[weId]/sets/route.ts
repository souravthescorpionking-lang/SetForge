import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setCreateSchema } from "@/lib/schemas";
import { createSet } from "@/server/services/workout-service";
import { notifySetSaved } from "@/server/services/program-service";

type Ctx = { params: Promise<{ id: string; weId: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId } = await params;
  const body = await parseBody(req, setCreateSchema);
  const result = await createSet(user.id, id, weId, body);
  // Part 5 FIRST_SET trigger: advance the cursor when the first set is saved
  await notifySetSaved(user.id, id).catch(() => undefined);
  return result;
});
