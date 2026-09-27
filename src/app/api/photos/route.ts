import type { NextRequest } from "next/server";
import { handler, requireUser } from "@/server/http";
import { listPhotos } from "@/server/services/measurement-service";

/** GET /api/photos?measurementId=|recordId= — progress photos (compare screen). */
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const measurementId = req.nextUrl.searchParams.get("measurementId") ?? undefined;
  const recordId = req.nextUrl.searchParams.get("recordId") ?? undefined;
  return { photos: await listPhotos(user.id, measurementId, recordId) };
});
