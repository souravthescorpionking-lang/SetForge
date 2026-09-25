import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { reorderSchema } from "@/lib/schemas";
import { reorderCategories } from "@/server/services/exercise-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, reorderSchema);
  return reorderCategories(user.id, body.ids);
});
