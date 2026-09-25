import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { lastSetsForExercise } from "@/server/services/exercise-service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  return lastSetsForExercise(user.id, id, before);
});
