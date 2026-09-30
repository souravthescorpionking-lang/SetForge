import { handler, requireUser } from "@/server/http";
import { getActiveChallenge } from "@/server/services/program-service";

/** GET /api/challenges/active (Part 9 §10) — banner payload or null. */
export const GET = handler(async () => {
  const user = await requireUser();
  return { challenge: await getActiveChallenge(user.id) };
});
