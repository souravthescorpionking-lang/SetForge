import { handler, requireUser } from "@/server/http";
import { getProgramVariants } from "@/server/services/program-service";

type Ctx = { params: Promise<{ routineId: string }> };

/** GET /api/programs/:id/variants (§12) — the builder editor's variant/phase
 *  tree + day phase assignments + publish state. */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  return getProgramVariants(user.id, routineId);
});
