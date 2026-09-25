import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { statsQuerySchema } from "@/lib/schemas";
import { getStats } from "@/server/services/analysis-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const query = statsQuerySchema.parse({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return getStats(user.id, query);
});
