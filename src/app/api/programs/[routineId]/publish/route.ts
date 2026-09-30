import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { setProgramPublish } from "@/server/services/program-service";
import { programPublishSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ routineId: string }> };

/** PUT /api/programs/:id/publish (§12) — owner-only isPublic toggle; optional
 *  tagline/description/weeks persist in the same write. */
export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  const body = await parseBody(req, programPublishSchema);
  return setProgramPublish(user.id, routineId, body);
});
