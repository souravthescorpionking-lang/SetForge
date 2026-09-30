import { handler, requireUser } from "@/server/http";
import { exerciseMaxWeight } from "@/server/services/exercise-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/exercises/:id/max — Part 10 §3.1 R3: the heaviest completed,
 * non-warm-up weight ever logged for this exercise (un-removed workouts;
 * includes the in-progress session). { maxWeight: null } when nothing logged.
 */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return exerciseMaxWeight(user.id, id);
});
