import type { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listWorkouts } from "@/server/services/workout-service";

/** GET /api/history?search=&from=&to= — thin alias over the workouts list (§4.12). */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  const workouts = await listWorkouts(user.id, { search, from, to });
  return { workouts };
});
