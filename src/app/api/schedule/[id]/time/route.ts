import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setScheduleTime } from "@/server/services/program-service";
import { scheduleTimeSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/schedule/:id/time — set/clear "HH:MM" time-of-day (§4.13). */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, scheduleTimeSchema);
  return setScheduleTime(user.id, id, body.time);
});
