import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listWorkouts } from "@/server/services/workout-service";
import { z } from "zod";

/**
 * GET /api/logs?q=&dayId=&view= — §14 spec alias of GET /api/workouts.
 *
 * The logs surface (#/logs) is backed by the workouts collection; this route
 * exists so the spec's endpoint list is literally satisfiable. `q` is the
 * spec's name for the search term (accepted alongside `search`); `view`
 * (list|calendar) is client-side URL state, accepted here for deep-link
 * symmetry and ignored server-side. `from`/`to` are forwarded for the
 * calendar month window.
 */
export const logsQuerySchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  search: z.string().trim().min(1).optional().catch(undefined),
  dayId: z.string().optional().catch(undefined),
  view: z.enum(["list", "calendar"]).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const query = logsQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const search = query.q ?? query.search;
  return {
    workouts: await listWorkouts(user.id, {
      from: query.from,
      to: query.to,
      search,
      dayId: query.dayId,
    }),
  };
});
