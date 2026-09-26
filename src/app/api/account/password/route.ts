import { NextRequest } from "next/server";
import { handler, parseBody, rateLimit, requireUser } from "@/server/http";
import { passwordChangeSchema } from "@/lib/schemas";
import { changePassword } from "@/server/services/auth-service";

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  rateLimit(`password:${user.id}`);
  const body = await parseBody(req, passwordChangeSchema);
  await changePassword(user.id, body.currentPassword, body.newPassword);
  return { ok: true };
});
