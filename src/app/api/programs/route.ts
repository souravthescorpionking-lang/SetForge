import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { programListQuerySchema } from "@/lib/schemas";
import { getProgramCatalog } from "@/server/services/program-catalog";

/** GET /api/programs?kind=&difficulty= — Part 9 §3 variant-aware catalog DTOs
 *  (superset of the legacy ProgramSummaryDTO). kind filters ROUTINE|SESSION
 *  (omit = all); difficulty scopes the variant info (omit = user's difficulty). */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const query = programListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return getProgramCatalog(user.id, query.difficulty, query.kind);
});
