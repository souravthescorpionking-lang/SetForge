import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { programDetailQuerySchema } from "@/lib/schemas";
import { getProgramDetail } from "@/server/services/program-catalog";

/** GET /api/programs/:id?difficulty= — Part 9 §4 program detail: the whole
 *  variant tree with per-phase days in effective (PhaseOverride-applied)
 *  order, marketing copy and current-program cursor info. */
export const GET = handler(async (req: NextRequest, ctx) => {
  const user = await requireUser();
  const { routineId } = await ctx.params;
  const query = programDetailQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return getProgramDetail(user.id, routineId, query.difficulty);
});
