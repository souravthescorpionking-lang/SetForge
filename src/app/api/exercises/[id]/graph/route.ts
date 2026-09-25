import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { graphQuerySchema } from "@/lib/schemas";
import { getGraph } from "@/server/services/analysis-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const url = new URL(req.url);
  const query = graphQuerySchema.parse({
    metric: url.searchParams.get("metric") ?? undefined,
    reps: url.searchParams.get("reps") ?? undefined,
    rm: url.searchParams.get("rm") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return getGraph(user.id, id, query);
});
