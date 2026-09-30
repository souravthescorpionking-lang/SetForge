import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { programStartSchema } from "@/lib/schemas";
import { startProgram } from "@/server/services/program-service";

/** POST /api/programs/:id/start { phaseIdx } (Part 9 §4) — follow + schedule regeneration. */
export const POST = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { routineId } = await ctx.params;
  const body = await parseBody(req, programStartSchema).catch(() => ({}));
  return startProgram(user.id, routineId, body);
});
