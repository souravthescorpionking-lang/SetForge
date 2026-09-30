import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { duplicateCustomWorkout } from "@/server/services/day-service";

type Ctx = { params: Promise<{ dayId: string }> };

/** POST /api/days/:dayId/duplicate — §4.1 duplicate a custom workout (owner-scoped). */
export const POST = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return duplicateCustomWorkout(user.id, dayId);
});
