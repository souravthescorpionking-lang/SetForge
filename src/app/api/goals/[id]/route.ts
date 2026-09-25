import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { goalUpdateSchema } from "@/lib/schemas";
import { updateGoal, deleteGoal } from "@/server/services/analysis-service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, goalUpdateSchema);
  return updateGoal(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteGoal(user.id, id);
});
