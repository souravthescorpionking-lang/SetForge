import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { removeDayFavouriteV2, toggleDayFavouriteV2 } from "@/server/services/day-service";

type Ctx = { params: Promise<{ dayId: string }> };

/** POST /api/days/:dayId/favorite — §5 toggle the DayFavorite row. */
export const POST = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return toggleDayFavouriteV2(user.id, dayId);
});

/** DELETE /api/days/:dayId/favorite — remove (idempotent). */
export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return removeDayFavouriteV2(user.id, dayId);
});
