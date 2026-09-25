import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineLogSchema } from "@/lib/schemas";
import { logRoutineDay } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, routineLogSchema);
  return logRoutineDay(user.id, id, body);
});
