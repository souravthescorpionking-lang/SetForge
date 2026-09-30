import { handler, requireUser } from "@/server/http";
import { removeProgramPhase } from "@/server/services/program-service";

type Ctx = { params: Promise<{ routineId: string; phaseId: string }> };

/** DELETE /api/programs/:id/phases/:phaseId (§12) — remove the phase; its days
 *  fall back to unassigned (RoutineDay.phase onDelete: SetNull). */
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { phaseId } = await params;
  return removeProgramPhase(user.id, phaseId);
});
