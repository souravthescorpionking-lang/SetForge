import { handler, requireUser } from "@/server/http";
import { discardWorkout } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/workouts/:id/discard — §4.11 Finish ASK "Discard workout". */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return discardWorkout(user.id, id);
});
