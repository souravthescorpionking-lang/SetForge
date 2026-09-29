// GET /api/workouts/active — the in-progress session (§3.10 Logging target).
// Null when none is running (client redirects #/session → #/workout).
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { getActiveSession } from "@/server/services/workout-service";

export const GET = handler(async (_req: NextRequest) => {
  const user = await requireUser();
  return { workout: await getActiveSession(user.id) };
});
