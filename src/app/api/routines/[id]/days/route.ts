import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineDayCreateSchema } from "@/lib/schemas";
import { createRoutineDay } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, routineDayCreateSchema);
  return createRoutineDay(user.id, id, body);
});
