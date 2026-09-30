import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { dayOverridePatchSchema } from "@/lib/schemas";
import { putDayOverride } from "@/server/services/day-service";

type Ctx = { params: Promise<{ dayId: string }> };

/** PUT /api/days/:dayId/override — §5.1/§5.2/§5.4 DayOverride save (partial). */
export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { dayId } = await params;
  const patch = await parseBody(req, dayOverridePatchSchema);
  return putDayOverride(user.id, dayId, patch);
});
