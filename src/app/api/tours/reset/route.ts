/* eslint-disable setforge-tour/no-content-files -- server API route, not a tour content file (LAW 1 targets UI content files only). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handler, parseBody, requireUser } from "@/server/http";
import { db } from "@/lib/db";

const bodySchema = z
  .object({
    scope: z.enum(["all", "screen"]),
    screenId: z.string().min(1).max(64).optional(),
  })
  .refine((b) => b.scope !== "screen" || typeof b.screenId === "string", {
    message: "screenId is required when scope is 'screen'",
    path: ["screenId"],
  });

/** POST /api/tours/reset — wipe tour/hint state (all, or a single screen's tour). */
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, bodySchema);
  if (body.scope === "screen" && !body.screenId) throw badRequest("screenId is required when scope is 'screen'");

  if (body.scope === "all") {
    await db.$transaction([
      db.userTourState.deleteMany({ where: { userId: user.id } }),
      db.userHintState.deleteMany({ where: { userId: user.id } }),
    ]);
    return { ok: true, scope: "all" as const };
  }

  const deleted = await db.userTourState.deleteMany({
    where: { userId: user.id, screenId: body.screenId },
  });
  return { ok: true, scope: "screen" as const, deleted: deleted.count };
});
