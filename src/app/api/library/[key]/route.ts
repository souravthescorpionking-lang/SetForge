import { handler, requireUser } from "@/server/http";
import { getLibraryEntry } from "@/server/services/library-service";

type Ctx = { params: Promise<{ key: string }> };

/** GET /api/library/:key — single catalog entry (+ adoption state). */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { key } = await params;
  return getLibraryEntry(user.id, key);
});
