import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { getProfile, updateProfile } from "@/server/services/profile-service";
import { profilePatchSchema } from "@/lib/schemas";

/** GET /api/profile */
export const GET = handler(async () => {
  const user = await requireUser();
  return getProfile(user.id);
});

/** PUT /api/profile */
export const PUT = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, profilePatchSchema);
  return updateProfile(user.id, body);
});
