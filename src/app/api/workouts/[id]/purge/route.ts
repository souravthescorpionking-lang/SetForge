// POST /api/workouts/:id/purge — §6.9 "Delete permanently" from Removed items.
import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { purgeWorkout } from "@/server/services/workout-service";

export const POST = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return purgeWorkout(user.id, id);
});
