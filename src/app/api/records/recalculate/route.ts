import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { z } from "zod";
import { recalculatePRs } from "@/server/services/analysis-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ exerciseId: z.string().optional() }));
  return recalculatePRs(user.id, body.exerciseId);
});
