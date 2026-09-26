import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { exerciseHistory } from "@/server/services/exercise-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  return exerciseHistory(user.id, id, Math.min(Math.max(1, limit), 500));
});
