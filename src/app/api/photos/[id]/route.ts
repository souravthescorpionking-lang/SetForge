import { handler, requireUser } from "@/server/http";
import { deletePhoto } from "@/server/services/measurement-service";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/photos/:id — remove a progress photo (row + media best-effort). */
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return deletePhoto(user.id, id);
});
