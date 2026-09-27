import type { NextRequest } from "next/server";
import { handler, parseBody, rateLimit, clientIp } from "@/server/http";
import { sendEmailConfirmationToken } from "@/server/services/auth-service";
import { resendConfirmationSchema } from "@/lib/schemas";

/** POST /api/auth/resend-confirmation {email} — rate-limited resend (§4.16). */
export const POST = handler(async (req: NextRequest) => {
  rateLimit(`resend:${clientIp(req)}`);
  const body = await parseBody(req, resendConfirmationSchema);
  return sendEmailConfirmationToken(body.email);
});
