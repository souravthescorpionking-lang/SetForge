import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { workoutEndSchema } from "@/lib/schemas";
import { endWorkout } from "@/server/services/program-service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/workouts/:id/end — Part 10 §3.6 exit semantics (single flow):
 *   { markComplete: true }  → finish (markedComplete, totals, cursor advance)
 *   { markComplete: false } → 0 sets: discard · >0 sets: partial save
 *                             (finished, markedComplete=false, no cursor move,
 *                             schedule back to PLANNED)
 * 409 (with the current end state as details) when already finished/discarded.
 */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, workoutEndSchema);
  return endWorkout(user.id, id, body.markComplete);
});
