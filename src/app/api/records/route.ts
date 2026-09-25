import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listAllRecords, getRecords } from "@/server/services/analysis-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const exerciseId = new URL(req.url).searchParams.get("exerciseId");
  if (exerciseId) return getRecords(user.id, exerciseId);
  return { records: await listAllRecords(user.id) };
});
