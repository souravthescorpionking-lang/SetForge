import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { dismissChallenge } from "@/server/services/program-service";

/** DELETE /api/challenges/:id/dismiss (Part 9 §10) — hide the banner for this user. */
export const DELETE = handler(async (_req: NextRequest, ctx) => {
  const user = await requireUser();
  const { challengeId } = await ctx.params;
  return dismissChallenge(user.id, challengeId);
});
