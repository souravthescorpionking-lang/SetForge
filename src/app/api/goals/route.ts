import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { goalCreateSchema } from "@/lib/schemas";
import { listGoals, createGoal } from "@/server/services/analysis-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const exerciseId = new URL(req.url).searchParams.get("exerciseId") ?? undefined;
  const goals = await listGoals(user.id);
  return { goals: exerciseId ? goals.filter((g) => g.exerciseId === exerciseId) : goals };
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, goalCreateSchema);
  return createGoal(user.id, body);
});
