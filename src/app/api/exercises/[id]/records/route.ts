import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { getRecords } from "@/server/services/analysis-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return getRecords(user.id, id);
});
