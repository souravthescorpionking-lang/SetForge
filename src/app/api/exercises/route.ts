import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { exerciseCreateSchema, exerciseQuerySchema } from "@/lib/schemas";
import { listExercises, createExercise } from "@/server/services/exercise-service";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const query = exerciseQuerySchema.parse({
    search: url.searchParams.get("search") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    favoritesOnly: url.searchParams.get("favoritesOnly") ?? undefined,
  });
  return listExercises(user.id, query);
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, exerciseCreateSchema);
  return createExercise(user.id, body);
});
