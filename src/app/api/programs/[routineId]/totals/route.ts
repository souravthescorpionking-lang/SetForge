import { handler, requireUser } from "@/server/http";
import { getProgramTotals } from "@/server/services/program-service";

type Ctx = { params: Promise<{ routineId: string }> };

/** GET /api/programs/:id/totals — sets logged · weight lifted · workouts (§4.5). */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  return getProgramTotals(user.id, routineId);
});
