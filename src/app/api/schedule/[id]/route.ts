import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { scheduleUpdateSchema } from "@/lib/schemas";
import { deleteSchedule, updateSchedule } from "@/server/services/program-service";

export const PUT = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, scheduleUpdateSchema);
  return updateSchedule(user.id, id, body);
});

export const DELETE = handler(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return deleteSchedule(user.id, id);
});
