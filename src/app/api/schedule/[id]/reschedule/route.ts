import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { rescheduleSchedule } from "@/server/services/program-service";
import { scheduleRescheduleSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/schedule/:id/reschedule — Part 10 §5.1 MISSED action "Reschedule". */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, scheduleRescheduleSchema);
  return rescheduleSchedule(user.id, id, body);
});
