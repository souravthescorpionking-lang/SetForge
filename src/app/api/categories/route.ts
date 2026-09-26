import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { categoryCreateSchema } from "@/lib/schemas";
import { listCategories, createCategory } from "@/server/services/exercise-service";

export const GET = handler(async () => {
  const user = await requireUser();
  return listCategories(user.id);
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, categoryCreateSchema);
  return createCategory(user.id, body);
});
