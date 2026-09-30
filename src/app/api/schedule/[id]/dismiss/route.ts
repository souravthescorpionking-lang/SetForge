import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { dismissSchedule } from "@/server/services/program-service";
import { scheduleDismissSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/schedule/:id/dismiss — Part 10 §5.1 MISSED action "Dismiss". */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await parseBody(req, scheduleDismissSchema);
  return dismissSchedule(user.id, id);
});
