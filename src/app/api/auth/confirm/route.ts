import type { NextRequest } from "next/server";
import { handler, parseBody } from "@/server/http";
import { confirmEmail } from "@/server/services/auth-service";
import { confirmEmailSchema } from "@/lib/schemas";
import { rateLimit, clientIp } from "@/server/http";

/** POST /api/auth/confirm {token} — activate the account (§4.16). */
export const POST = handler(async (req: NextRequest) => {
  rateLimit(`confirm:${clientIp(req)}`);
  const body = await parseBody(req, confirmEmailSchema);
  return confirmEmail(body);
});
