import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { exerciseUpdateSchema } from "@/lib/schemas";
import { getExercise, updateExercise, deleteExercise } from "@/server/services/exercise-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return getExercise(user.id, id);
});

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, exerciseUpdateSchema);
  return updateExercise(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteExercise(user.id, id);
});
