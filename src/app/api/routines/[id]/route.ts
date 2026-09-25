import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { routineUpdateSchema } from "@/lib/schemas";
import { getRoutine, updateRoutine, deleteRoutine } from "@/server/services/routine-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return getRoutine(user.id, id);
});

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, routineUpdateSchema);
  return updateRoutine(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteRoutine(user.id, id);
});
