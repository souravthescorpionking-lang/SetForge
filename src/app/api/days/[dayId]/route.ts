import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { getDayDetail } from "@/server/services/day-service";

type Ctx = { params: Promise<{ dayId: string }> };

/** GET /api/days/:dayId — §5 Day Overview (override-merged detail). */
export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  return getDayDetail(user.id, dayId);
});
