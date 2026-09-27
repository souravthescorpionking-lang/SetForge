import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { startDaySchema } from "@/lib/schemas";
import { startProgramDay } from "@/server/services/program-service";

export const POST = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { routineId } = await ctx.params;
  const body = await parseBody(req, startDaySchema).catch(() => ({}));
  return startProgramDay(user.id, routineId, body);
});
