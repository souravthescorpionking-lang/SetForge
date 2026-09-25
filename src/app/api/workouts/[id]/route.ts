import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutUpdateSchema } from "@/lib/schemas";
import { getWorkout, updateWorkout, deleteWorkout } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return getWorkout(user.id, id);
});

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, workoutUpdateSchema);
  return updateWorkout(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteWorkout(user.id, id);
});
