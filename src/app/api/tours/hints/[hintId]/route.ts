/* eslint-disable setforge-tour/no-content-files -- server API route, not a tour content file (LAW 1 targets UI content files only). */
import { NextRequest } from "next/server";
import { badRequest, handler, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import type { TourHintStateDTO } from "@/lib/types";

type Ctx = { params: Promise<{ hintId: string }> };

/** PUT /api/tours/hints/[hintId] — mark a contextual hint as seen (idempotent). */
export const PUT = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { hintId } = await params;
  if (!hintId || hintId.length > 128) throw badRequest("Invalid hintId");

  const row = await db.userHintState.upsert({
    where: { userId_hintId: { userId: user.id, hintId } },
    create: { id: uuid7(), userId: user.id, hintId },
    update: { seenAt: new Date() },
  });

  return { hintId: row.hintId, seenAt: row.seenAt.toISOString() } satisfies TourHintStateDTO;
});
