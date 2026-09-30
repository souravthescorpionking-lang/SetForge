import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { markDayOffV2, unmarkDayOffV2 } from "@/server/services/day-service";

type Ctx = { params: Promise<{ dayId: string }> };

/**
 * POST /api/days/:dayId/mark-off — §5 Mark off (day-first): delegates to
 * program-service markDayOff and returns the minted workoutId for Undo.
 * Hidden in the UI when the day belongs to a SESSION-kind routine.
 */
export const POST = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return markDayOffV2(user.id, dayId);
});

/** DELETE …/mark-off — Undo: clears the completed marker + soft-removes the
 *  duration-0 mark-off Log(s) and their DONE schedule entries. */
export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return unmarkDayOffV2(user.id, dayId);
});
