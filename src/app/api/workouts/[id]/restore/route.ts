import { handler, requireUser } from "@/server/http";
import { restoreWorkout } from "@/server/services/workout-service";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/workouts/:id/restore — clears removedAt/removeReason (Undo / Settings restore). */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return restoreWorkout(user.id, id);
});
