import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { exerciseHistory } from "@/server/services/exercise-service";
import { exerciseHistoryQuerySchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/exercises/:id/history?limit=&view=
 * Part 10 §3.3: `view=sessions` returns the last finished, un-removed workouts
 * containing the exercise (each with date, sourceLabel, full sets) — the live
 * screen's History tab. Default view keeps the legacy all-rows behaviour.
 */
export const GET = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const query = exerciseHistoryQuerySchema.parse({
    limit: new URL(req.url).searchParams.get("limit") ?? undefined,
    view: new URL(req.url).searchParams.get("view") ?? undefined,
  });
  return exerciseHistory(user.id, id, query.limit, { finishedOnly: query.view === "sessions" });
});
