import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { getProgramMeta, updateProgramMeta } from "@/server/services/program-service";
import { programMetaPatchSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ routineId: string }> };

/** GET /api/programs/:id/meta (§4.4/§4.5). */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  return getProgramMeta(user.id, routineId);
});

/** PUT /api/programs/:id/meta — difficulty, phases, highlights, labels, favourite. */
export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  const body = await parseBody(req, programMetaPatchSchema);
  return updateProgramMeta(user.id, routineId, body);
});
