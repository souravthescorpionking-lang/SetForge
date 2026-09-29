/* eslint-disable setforge-tour/no-content-files -- server API route, not a tour content file (LAW 1 targets UI content files only). */
import { handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import type { TourHintStateDTO, TourStateDTO } from "@/lib/types";

/** GET /api/tours/state → the user's full tour + hint state. */
export const GET = handler(async () => {
  const user = await requireUser();
  const [states, hints] = await Promise.all([
    db.userTourState.findMany({ where: { userId: user.id } }),
    db.userHintState.findMany({ where: { userId: user.id } }),
  ]);
  return {
    states: states.map<TourStateDTO>((s) => ({
      screenId: s.screenId,
      version: s.version,
      status: s.status as TourStateDTO["status"],
      stepReached: s.stepReached,
      updatedAt: s.updatedAt.toISOString(),
    })),
    hints: hints.map<TourHintStateDTO>((h) => ({ hintId: h.hintId, seenAt: h.seenAt.toISOString() })),
  };
});
