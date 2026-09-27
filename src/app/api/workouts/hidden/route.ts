import { handler, requireUser } from "@/server/http";
import { listHiddenWorkouts } from "@/server/services/workout-service";

/** GET /api/workouts/hidden — discarded + soft-deleted workouts (Settings → Data). */
export const GET = handler(async () => {
  const user = await requireUser();
  return { workouts: await listHiddenWorkouts(user.id) };
});
