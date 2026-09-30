import type { NextRequest } from "next/server";
import { handler, parseBody, requireUser } from "@/server/http";
import { userProfilePatchSchema } from "@/lib/schemas";
import { getUserAccount, updateUserAccount } from "@/server/services/profile-service";

/** GET /api/user/profile — User-level account fields (Part 10 §9 rows). */
export const GET = handler(async () => {
  const user = await requireUser();
  return getUserAccount(user.id);
});

/** PATCH /api/user/profile — name/gender/birthYear/weighInDays/avatarKey (§9). */
export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await parseBody(req, userProfilePatchSchema);
  return updateUserAccount(user.id, body);
});
