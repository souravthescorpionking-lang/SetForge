import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { addProgramPhase } from "@/server/services/program-service";
import { programPhaseCreateSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ routineId: string }> };

/** POST /api/programs/:id/phases (§12) — add a phase to the variant at
 *  `difficulty` (default: the routine's legacy difficulty, else INTERMEDIATE;
 *  the variant is created on demand when missing). */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { routineId } = await params;
  const body = await parseBody(req, programPhaseCreateSchema);
  return addProgramPhase(user.id, routineId, body);
});
