// POST /api/routines/:id/groups — Part 8 §3.8 builder "+ Group":
// creates a RoutineGroup and optionally assigns one exercise to it.
import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineGroupCreateSchema } from "@/lib/schemas";
import { createRoutineGroup } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, routineGroupCreateSchema);
  return createRoutineGroup(user.id, id, body);
});
