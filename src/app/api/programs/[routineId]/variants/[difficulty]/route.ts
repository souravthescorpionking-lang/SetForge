import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, parseBody, requireUser } from "@/server/http";
import { setProgramVariantMeta } from "@/server/services/program-service";
import { DIFFICULTIES } from "@/lib/constants";
import { programVariantMetaSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ routineId: string; difficulty: string }> };

const difficultyParam = z.enum(DIFFICULTIES);

/** PUT /api/programs/:id/variants/:difficulty (§12) — upsert the variant at the
 *  path difficulty (creating it on demand when the builder tab is first
 *  selected) and update daysPerWeek/equipment when provided. */
export const PUT = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { routineId, difficulty: raw } = await params;
  const difficulty = difficultyParam.parse(raw);
  const body = await parseBody(req, programVariantMetaSchema);
  return setProgramVariantMeta(user.id, routineId, difficulty, body);
});
