import { handler, requireUser } from "@/server/http";
import { reconcileMissedSchedule } from "@/server/services/program-service";

/**
 * POST /api/schedule/reconcile-missed (Part 9 §6) — idempotent MISSED sweep.
 * Called on app open (dashboard load) and nightly by the timezone refresh job.
 */
export const POST = handler(async () => {
  const user = await requireUser();
  return reconcileMissedSchedule(user.id);
});
