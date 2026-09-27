import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { programFollowSchema } from "@/lib/schemas";
import { followProgram } from "@/server/services/program-service";

export const POST = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { routineId } = await ctx.params;
  const body = await parseBody(req, programFollowSchema).catch(() => ({}));
  return followProgram(user.id, routineId, body);
});
