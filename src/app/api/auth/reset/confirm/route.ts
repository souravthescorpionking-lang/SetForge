import { NextRequest } from "next/server";
import { handler, parseBody, rateLimit, clientIp } from "@/server/http";
import { resetConfirmSchema } from "@/lib/schemas";
import { confirmPasswordReset } from "@/server/services/auth-service";

// Password reset confirm (audit B8): token + new password → rehash, revoke sessions.
export const POST = handler(async (req: NextRequest) => {
  rateLimit(`reset-confirm:${clientIp(req)}`);
  const body = await parseBody(req, resetConfirmSchema);
  return confirmPasswordReset(body);
});
