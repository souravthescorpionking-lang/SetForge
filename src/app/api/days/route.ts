import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, requireUser } from "@/server/http";
import { listCustomWorkouts } from "@/server/services/routine-service";

const daysQuerySchema = z.object({
  // Part 10 §4.1: the only supported collection filter today — custom workouts.
  source: z.literal("CUSTOM").optional(),
});

/** GET /api/days?source=CUSTOM — §4.1 "Your workouts" list rows (with dayId). */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const query = daysQuerySchema.parse({
    source: url.searchParams.get("source") ?? undefined,
  });
  if (query.source !== "CUSTOM") {
    // Reserved for future collection filters; nothing else is defined yet.
    return { workouts: [] };
  }
  return { workouts: await listCustomWorkouts(user.id) };
});
