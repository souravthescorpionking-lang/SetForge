import { handler, requireUser } from "@/server/http";
import { toggleDayFavourite } from "@/server/services/program-service";

type Ctx = { params: Promise<{ routineId: string; dayId: string }> };

/** POST /api/programs/:id/days/:dayId/favourite — toggle day favourite. */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId, dayId } = await params;
  return toggleDayFavourite(user.id, routineId, dayId);
});
