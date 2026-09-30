import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { joinChallenge } from "@/server/services/program-service";

/** POST /api/challenges/:id/join (Part 9 §10) — start flow at user difficulty, programStartedAt = startsOn. */
export const POST = handler(async (_req: NextRequest, ctx) => {
  const user = await requireUser();
  const { challengeId } = await ctx.params;
  return joinChallenge(user.id, challengeId);
});
