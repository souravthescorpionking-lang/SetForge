import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { stepGoalPatchSchema } from "@/lib/schemas";
import { setStepGoal } from "@/server/services/steps-service";

/** PATCH /api/user/step-goal {stepGoal} (Part 10 §8.3). */
export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, stepGoalPatchSchema);
  return setStepGoal(user.id, body.stepGoal);
});
