/* eslint-disable setforge-tour/no-content-files -- server API route, not a tour content file (LAW 1 targets UI content files only). */
import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handler, parseBody, requireUser } from "@/server/http";
import { db } from "@/lib/db";
import { uuid7 } from "@/lib/uuid7";
import type { TourStateDTO } from "@/lib/types";

const bodySchema = z.object({
  version: z.string().min(1).max(64),
  status: z.enum(["SEEN", "SKIPPED", "COMPLETED"]),
  stepReached: z.number().int().min(0).max(999),
});

type Ctx = { params: Promise<{ screenId: string }> };

/** PUT /api/tours/state/[screenId] — upsert the outcome of one screen's tour. */
export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { screenId } = await params;
  if (!screenId || screenId.length > 64) throw badRequest("Invalid screenId");
  const body = await parseBody(req, bodySchema);

  const row = await db.userTourState.upsert({
    where: { userId_screenId: { userId: user.id, screenId } },
    create: {
      id: uuid7(),
      userId: user.id,
      screenId,
      version: body.version,
      status: body.status,
      stepReached: body.stepReached,
    },
    update: {
      version: body.version,
      status: body.status,
      stepReached: body.stepReached,
    },
  });

  return {
    screenId: row.screenId,
    version: row.version,
    status: row.status as TourStateDTO["status"],
    stepReached: row.stepReached,
    updatedAt: row.updatedAt.toISOString(),
  } satisfies TourStateDTO;
});
