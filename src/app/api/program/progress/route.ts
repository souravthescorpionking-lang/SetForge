import { handler, requireUser } from "@/server/http";
import { getProgramProgress } from "@/server/services/program-catalog";

/** GET /api/program/progress — §7.1 rows for the followed program (null when none). */
export const GET = handler(async () => {
  const user = await requireUser();
  return getProgramProgress(user.id);
});
