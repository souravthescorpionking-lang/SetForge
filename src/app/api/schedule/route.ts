import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { scheduleCreateSchema, scheduleQuerySchema } from "@/lib/schemas";
import { createSchedule, listSchedule } from "@/server/services/program-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const query = scheduleQuerySchema.parse(params);
  return listSchedule(user.id, query);
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, scheduleCreateSchema);
  return createSchedule(user.id, body);
});
