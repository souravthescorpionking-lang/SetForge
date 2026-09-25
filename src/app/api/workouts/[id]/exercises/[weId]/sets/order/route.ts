import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { orderSchema } from "@/lib/schemas";
import { reorderSets } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string; weId: string }> };

export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, weId } = await params;
  const body = await parseBody(req, orderSchema);
  return reorderSets(user.id, id, weId, body.ids);
});
