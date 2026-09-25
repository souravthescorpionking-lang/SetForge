import { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { categoryUpdateSchema } from "@/lib/schemas";
import { updateCategory, deleteCategory } from "@/server/services/exercise-service";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(req, categoryUpdateSchema);
  return updateCategory(user.id, id, body);
});

export const DELETE = handler<Ctx>(async (_req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deleteCategory(user.id, id);
});
