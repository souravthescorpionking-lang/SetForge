import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { exerciseCreateSchema, exerciseQuerySchema } from "@/lib/schemas";
import { listExercises, createExercise } from "@/server/services/exercise-service";

/** csv → trimmed non-empty values (unknown entries dropped by the service filters). */
function csv(raw: string | null): string[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const query = exerciseQuerySchema.parse({
    search: url.searchParams.get("search") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    favoritesOnly: url.searchParams.get("favoritesOnly") ?? undefined,
    // ---- Part 10 §4.3: builder add-exercise filters ----
    q: url.searchParams.get("q") ?? undefined,
    muscles: url.searchParams.get("muscles") ?? undefined,
    equipment: url.searchParams.get("equipment") ?? undefined,
  });
  return listExercises(user.id, {
    search: query.q ?? query.search,
    categoryId: query.categoryId,
    favoritesOnly: query.favoritesOnly,
    muscles: csv(url.searchParams.get("muscles")),
    equipment: csv(url.searchParams.get("equipment")),
  });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, exerciseCreateSchema);
  return createExercise(user.id, body);
});
