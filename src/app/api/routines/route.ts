import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineCreateSchema } from "@/lib/schemas";
import { listRoutines, createRoutine } from "@/server/services/routine-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return { routines: await listRoutines(user.id) };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, routineCreateSchema);
  return createRoutine(user.id, body);
});
