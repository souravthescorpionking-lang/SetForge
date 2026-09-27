import { handler, requireUser } from "@/server/http";
import { markDayOff, unmarkDayOff } from "@/server/services/program-service";

type Ctx = { params: Promise<{ routineId: string; dayId: string }> };

/** POST /api/programs/:id/days/:dayId/mark-off — §4.5 DayActionRow "Mark off". */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId, dayId } = await params;
  return markDayOff(user.id, routineId, dayId);
});

/** DELETE …/mark-off — un-mark (client toasts + Undo). */
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { routineId, dayId } = await params;
  return unmarkDayOff(user.id, routineId, dayId);
});
