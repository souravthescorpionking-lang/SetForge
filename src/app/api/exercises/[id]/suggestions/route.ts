import { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { getExerciseSuggestions } from "@/server/services/day-service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/exercises/:id/suggestions — §5.2 replace candidates (≤8). */
export const GET = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return getExerciseSuggestions(user.id, id);
});
