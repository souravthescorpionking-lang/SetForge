import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { attachPhoto, listPhotos } from "@/server/services/measurement-service";
import { photoAttachSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string; recId: string }> };

/** POST /api/measurements/:id/records/:recId/photos — attach (upsert per slot). */
export const POST = handler<Ctx>(async (req: NextRequest, { params }) => {
  const user = await requireUser();
  const { id, recId } = await params;
  const body = await parseBody(req, photoAttachSchema);
  return attachPhoto(user.id, id, recId, body);
});

/** GET /api/measurements/:id/records/:recId/photos — photos of one record. */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { recId } = await params;
  return { photos: await listPhotos(user.id, undefined, recId) };
});
