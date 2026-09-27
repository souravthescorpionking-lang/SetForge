import type { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { getWeightTable } from "@/server/services/exercise-service";
import { weightTableQuerySchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/exercises/:id/weight-table?limit=12&before=YYYY-MM-DD (§4.12). */
export const GET = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const query = weightTableQuerySchema.parse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    before: req.nextUrl.searchParams.get("before") ?? undefined,
  });
  return getWeightTable(user.id, id, query);
});
