import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { stepsQuerySchema, stepsPostSchema } from "@/lib/schemas";
import { listSteps, logSteps } from "@/server/services/steps-service";

/** GET /api/steps?from=&to= — manual step entries in range + the daily goal (§8.3). */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const params = stepsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listSteps(user.id, params);
});

/** POST /api/steps {date, steps, mode: ADD|SET} — upsert by date (§8.3). */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, stepsPostSchema);
  return logSteps(user.id, body);
});
